/**
 * ELLINES HAVEN — leftover Service Worker cleanup (optional)
 *
 * Modern builds no longer register this file. If an old client still has it,
 * activate once, clear caches, and unregister without messaging reloads.
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
      await self.registration.unregister();
    } catch (_) { /* ignore */ }
  })());
});

self.addEventListener('fetch', () => {});
