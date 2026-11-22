/* Chess IR — service worker
 *
 * Rôle : rendre l'application installable et rapide à rouvrir.
 * - Fichiers du site (JS/CSS/icônes) : cache, puis mise à jour en arrière-plan.
 * - Pages : réseau d'abord, page en cache si hors ligne.
 * - Données (Supabase, Chess.com, polices externes) : JAMAIS mises en cache,
 *   pour que classements et résultats soient toujours à jour.
 * - Notifications push : affichage, vibration, et ouverture de la bonne page au toucher.
 */
const VERSION = 'chessir-v4'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  // Uniquement les GET du site lui-même ; le numéro de version est toujours lu en direct.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname === '/version.json') return

  // Navigation : réseau d'abord (toujours la dernière version), cache si hors ligne.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Fichiers statiques : cache, rafraîchi en arrière-plan.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})

/* ------------------------------------------------------------------ */
/* Notifications push                                                  */
/* ------------------------------------------------------------------ */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Chess IR', body: event.data ? event.data.text() : '' }
  }
  const urgent = data.type === 'challenge' || data.type === 'live'
  event.waitUntil(
    self.registration.showNotification(data.title || 'Chess IR', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Une notification par défi / direct : la suivante remplace la précédente au lieu de s'empiler.
      tag: data.type === 'challenge' || data.type === 'live' ? `${data.type}-${data.link}` : data.id,
      renotify: urgent,
      requireInteraction: data.type === 'challenge',
      vibrate: urgent ? [200, 100, 200, 100, 300] : [150],
      data: { link: data.link || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  const target = new URL(link, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // L'application est déjà ouverte : on la ramène au premier plan sur la bonne page.
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          return w.focus().then((c) => (c && 'navigate' in c ? c.navigate(target) : c))
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
