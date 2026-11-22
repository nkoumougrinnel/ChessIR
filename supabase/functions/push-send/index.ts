/**
 * Chess IR — Edge Function `push-send`
 *
 * Appelée par la base (déclencheur sur `notifications`, via pg_net) avec
 * { notification_id }. Envoie la notification sur tous les appareils abonnés
 * du destinataire (Web Push), une seule fois.
 *
 * Sans secret : la fonction ne fait qu'envoyer une notification déjà créée,
 * récente et pas encore envoyée. L'appeler à la main n'a donc aucun effet
 * indésirable (au pire, l'envoi part quelques millisecondes plus tôt).
 *
 * Variables d'environnement :
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (fournies par Supabase)
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY      clés générées par `npm run push:keys`
 *   VAPID_SUBJECT                            ex. mailto:contact@exemple.com ou https://chessir.vercel.app
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const MAX_AGE_MS = 15 * 60 * 1000

/** Durée de vie côté service push : inutile de livrer un défi de 5 minutes une heure plus tard. */
const TTL: Record<string, number> = { challenge: 5 * 60, live: 90 * 60 }
const URGENT = new Set(['challenge', 'live', 'result_to_confirm'])

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST attendu' }, 405)
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return json({ status: 'not_configured' })
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'https://chessir.vercel.app', publicKey, privateKey)

  const { notification_id } = await req.json().catch(() => ({}))
  if (typeof notification_id !== 'string') return json({ error: 'notification_id manquant' }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Réservation atomique : seule la première demande envoie.
  const since = new Date(Date.now() - MAX_AGE_MS).toISOString()
  const { data: n } = await db
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', notification_id)
    .is('pushed_at', null)
    .gte('created_at', since)
    .select('id, profile_id, type, title, body, link')
    .maybeSingle()
  if (!n) return json({ status: 'skipped' })

  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('profile_id', n.profile_id)
  const payload = JSON.stringify({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link ?? '/' })

  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        TTL: TTL[n.type] ?? 24 * 3600,
        urgency: URGENT.has(n.type) ? 'high' : 'normal',
      })
      sent++
      await db.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id)
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      // Abonnement expiré ou révoqué (app désinstallée, permission retirée) : on l'oublie.
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      else console.error('push', code, (e as Error).message)
    }
  }
  return json({ status: 'sent', sent, devices: subs?.length ?? 0 })
})
