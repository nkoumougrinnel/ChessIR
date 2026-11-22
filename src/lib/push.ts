/**
 * Notifications push : abonnement de cet appareil.
 *
 * - Android / ordinateur : fonctionne dans le navigateur et dans l'app installée.
 * - iPhone / iPad (iOS 16.4+) : UNIQUEMENT depuis l'app installée sur l'écran d'accueil.
 * La permission ne peut être demandée qu'après un geste de l'utilisateur (bouton).
 * L'envoi est fait côté serveur (Edge Function `push-send`), à chaque notification.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase, unwrap } from './supabase'
import { isIOS, isStandalone } from './pwa'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushStatus =
  | 'unsupported' // navigateur sans push, ou clé non configurée
  | 'ios-install' // iPhone : installer l'app d'abord
  | 'denied' // refusé : à réactiver dans les réglages
  | 'off' // jamais demandé, ou désactivé sur cet appareil
  | 'on' // abonné

function supported() {
  return (
    !!VAPID_PUBLIC_KEY &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function keyBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  // En développement, le service worker n'est pas enregistré automatiquement.
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('/sw.js')
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON()
  unwrap(
    await supabase.rpc('register_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh ?? '',
      p_auth: json.keys?.auth ?? '',
      p_user_agent: navigator.userAgent,
    }),
  )
}

export async function currentPushStatus(): Promise<PushStatus> {
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** À appeler depuis un bouton (geste requis). */
export async function enablePush(): Promise<PushStatus> {
  if (!supported()) return currentPushStatus()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await registration()
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY!) }))
  await save(sub)
  return 'on'
}

export async function disablePush(): Promise<PushStatus> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe().catch(() => undefined)
  }
  return 'off'
}

/**
 * Au démarrage (utilisateur connecté) : si la permission est déjà accordée, on
 * s'assure que l'abonnement de cet appareil est bien rattaché au compte courant.
 */
export async function resyncPush() {
  try {
    if (!supported() || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await save(sub)
  } catch {
    /* sans effet sur le reste de l'application */
  }
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void currentPushStatus().then(setStatus)
  }, [])

  const run = useCallback(async (action: () => Promise<PushStatus>) => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await action())
    } catch (e) {
      setError((e as Error).message || 'Activation impossible')
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    status,
    busy,
    error,
    enable: () => run(enablePush),
    disable: () => run(disablePush),
  }
}
