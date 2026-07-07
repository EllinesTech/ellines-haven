/**
 * Ellines Haven Service Worker
 * Strategy: Cache-first for static assets, network-first for HTML/API.
 * This makes repeat visits load instantly from cache.
 */

const CACHE_NAME = 'ellines-haven-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/logo-icon.png',
  '/logo-nobg.png',
  '/favicon.svg',
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and external requests (Firebase, Paystack, etc.)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // For HTML navigation — network first, fall back to cached index.html (SPA support)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache a fresh copy of index.html
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For hashed assets (/assets/*) — cache first (they never change)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached || fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
      )
    );
    return;
  }

  // For static files (images, fonts) — stale-while-revalidate
  if (/\.(png|jpg|jpeg|svg|webp|woff2|woff|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((res) => {
            cache.put(request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }
});
