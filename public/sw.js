/**
 * ELLINES HAVEN — Service Worker (KILL SWITCH)
 * 
 * This SW does ONE thing: immediately unregisters itself and clears all caches.
 * We disabled the SW to prevent cache corruption on deploys.
 * This file exists only to clean up old SW instances that are still running.
 */

// Immediately clear all caches and unregister
self.addEventListener('install', (event) => {
  // Skip waiting so this version activates immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Delete ALL caches
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))),
      // Claim all clients
      self.clients.claim(),
    ]).then(() => {
      // Unregister this service worker from all clients
      return self.registration.unregister();
    })
  );
});

// Pass ALL requests through without interception
self.addEventListener('fetch', () => {
  // Do nothing — let browser handle everything natively
});
