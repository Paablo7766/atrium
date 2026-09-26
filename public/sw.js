/* Service worker mínimo: recibe copias compartidas desde Drive / Archivos (PWA instalada). */
const CACHE = 'atrium-share-v1'
const PENDING = 'pending-restore'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.pathname !== '/share-import' || event.request.method !== 'POST') return

  event.respondWith(handleShareImport(event.request))
})

async function handleShareImport(request) {
  try {
    const form = await request.formData()
    const file = form.get('backup')
    if (file && typeof file.text === 'function') {
      const text = await file.text()
      const cache = await caches.open(CACHE)
      await cache.put(PENDING, new Response(text, { headers: { 'Content-Type': 'text/plain' } }))
    }
  } catch {
    /* ignore */
  }
  return Response.redirect('/?atrium_import=1', 303)
}
