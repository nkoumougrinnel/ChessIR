/**
 * Application installable (PWA) : installation et mises à jour automatiques.
 *
 * Installation
 * - Capture `beforeinstallprompt` (Chrome, Edge, Android) pour un vrai bouton « Installer ».
 * - Sur iPhone/iPad, aucun bouton n'est possible : on affiche la marche à suivre.
 * - Mémorise sur l'appareil que l'application est installée (premier lancement
 *   installé, événement `appinstalled`, ou détection Chrome Android) pour ne plus
 *   proposer l'installation.
 *
 * Mises à jour
 * - Chaque déploiement a un numéro de version (/version.json, voir vite.config.ts).
 * - Au retour au premier plan et toutes les 10 minutes, on compare avec la version
 *   en cours. Si l'application revient au premier plan, elle se recharge aussitôt
 *   (rien n'est en cours de saisie) ; si elle est déjà ouverte, un bandeau propose
 *   d'actualiser.
 */
import { useEffect, useState } from 'react'

declare const __APP_VERSION__: string

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INSTALLED_KEY = 'chessir-installed'
const CHECK_EVERY_MS = 10 * 60 * 1000

let deferred: BeforeInstallPromptEvent | null = null
let installedHere = false
let updateReady = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

const storage = {
  get(k: string) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* stockage indisponible */
    }
  },
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function markInstalled() {
  installedHere = true
  storage.set(INSTALLED_KEY, '1')
  emit()
}

/* ------------------------------------------------------------------ */
/* Mises à jour                                                        */
/* ------------------------------------------------------------------ */

let registration: ServiceWorkerRegistration | undefined

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    return ((await res.json()) as { version?: string }).version ?? null
  } catch {
    return null // hors ligne : on réessaiera
  }
}

/** Vérifie la présence d'une nouvelle version. `applyNow` : recharge immédiatement. */
async function checkForUpdate(applyNow: boolean) {
  const latest = await fetchLatestVersion()
  if (!latest || latest === __APP_VERSION__) return
  await registration?.update().catch(() => undefined)
  if (applyNow) {
    applyUpdate()
  } else if (!updateReady) {
    updateReady = true
    emit()
  }
}

export function applyUpdate() {
  window.location.reload()
}

/* ------------------------------------------------------------------ */
/* Initialisation (appelée avant le rendu React)                       */
/* ------------------------------------------------------------------ */

export function initPwa() {
  if (typeof window === 'undefined') return

  installedHere = storage.get(INSTALLED_KEY) === '1'
  if (isStandalone()) markInstalled()

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    markInstalled()
  })

  // Chrome Android : sait dire si cette application est déjà installée sur l'appareil.
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<Array<{ platform: string }>> }
  nav.getInstalledRelatedApps?.()
    .then((apps) => {
      if (apps.some((a) => a.platform === 'webapp')) markInstalled()
    })
    .catch(() => undefined)

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registration = reg
      })
      .catch(() => undefined)
  })

  // Retour au premier plan (application rouverte) : mise à jour appliquée tout de suite.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate(true)
  })
  // Pendant l'utilisation : on prévient, sans recharger sous les doigts de l'utilisateur.
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void checkForUpdate(false)
  }, CHECK_EVERY_MS)
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

function useEmitter() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
}

export function useInstall() {
  useEmitter()
  const installed = isStandalone() || installedHere
  return {
    installed,
    /** Le navigateur accepte d'afficher sa fenêtre d'installation. */
    canPrompt: !installed && deferred !== null,
    /** iPhone/iPad : installation manuelle via « Partager ». */
    iosManual: !installed && isIOS(),
    async install() {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      if (outcome === 'accepted') markInstalled()
      emit()
      return outcome === 'accepted'
    },
    /** iPhone : Safari ne peut pas savoir que l'app est installée, l'utilisateur le dit. */
    markInstalled,
  }
}

export function useUpdateReady() {
  useEmitter()
  return updateReady
}
