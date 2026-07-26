/**
 * ELLINES HAVEN — Service Worker (KILL SWITCH)
 *
 * Never caches anything (CDN owns /assets/ hashed bundles).
 * Purpose: displace any lingering old caching SW, clear Cache Storage,
 * claim clients, then unregister so refresh always hits the network.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) { /* ignore */ }

    try {
      await self.clients.claim();
    } catch (_) { /* ignore */ }

    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'EH_SW_KILLED' });
      }
    } catch (_) { /* ignore */ }

    try {
      await self.registration.unregister();
    } catch (_) { /* ignore */ }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Never intercept — do not call event.respondWith(). Browser/CDN handle all fetches.
self.addEventListener('fetch', () => {});
