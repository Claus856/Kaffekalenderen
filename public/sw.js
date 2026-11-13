/*
 * Service worker: gør appens skal hurtig at åbne og lader den starte uden net.
 *
 *  - /assets/* og /icons/* (filnavne med hash, ændrer sig aldrig): cache først.
 *  - Sider (navigation): net først, så en ny version altid hentes med det samme. Uden net bruges den sidst hentede skal.
 *  - Alt andet (Supabase-kald, billeder fra BREW): rører vi ikke. Data caches ALDRIG her, så karakterer altid er friske.
 */
const CACHE = 'kaffekalenderen-static-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('kaffekalenderen-') && key !== CACHE) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      })(),
    )
    return
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const res = await fetch(req)
          if (res.ok) cache.put('/index.html', res.clone())
          return res
        } catch {
          return (await cache.match('/index.html')) ?? Response.error()
        }
      })(),
    )
  }
})
