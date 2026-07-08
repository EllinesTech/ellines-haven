/**
 * Ellines Haven Service Worker
 *
 * Strategy:
 *  - HTML navigation  → network-first, fall back to /index.html (SPA support)
 *  - /assets/**       → cache-first (content-hashed, never stale)
 *  - images/fonts     → stale-while-revalidate
 *
 * CACHE_NAME is auto-stamped with a build timestamp by vite.config.js on every
 * production build, so mobile users always get fresh JS/CSS after a deploy.
 *
 * On activation the SW posts { type: 'SW_UPDATED' } to all open tabs so the
 * app can show a "New version available — refresh" banner.
 */

const CACHE_NAME = 'ellines-haven-20260707'; // replaced at build time by stamp-sw plugin

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/logo-icon.png',
  '/favicon.svg',
];

// ── Install: pre-cache shell ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {}) // non-fatal if an asset is missing
    )
  );
  // Take control immediately — don't wait for old SW to die
  self.skipWaiting();
});

// ── Activate: delete stale caches, tell all tabs ─────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => {
      // Claim all clients so pages under this scope use the new SW immediately
      return self.clients.claim();
    }).then(() => {
      // Notify every open tab that a new version is live
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
      });
    })
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // ── HTML navigation: network-first, SPA fallback ──────────────────────────
  // Preserves the exact URL on reload — React Router rehydrates to the right page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            // Cache a fresh copy
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(new Request('/index.html'), res.clone()))
              .catch(() => {});
          }
          return res;
        })
        .catch(() =>
          // Offline: serve cached shell — browser URL stays as-is, SPA handles routing
          caches.match('/index.html').then((r) => r || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // ── Content-hashed assets: cache-first (immutable) ───────────────────────
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, res.clone()))
              .catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // ── Static assets (images, fonts): stale-while-revalidate ────────────────
  if (/\.(png|jpg|jpeg|svg|webp|woff2|woff|ico|gif)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone()).catch(() => {});
              return res;
            })
            .catch(() => cached); // network failed — serve cache
          // Return cache immediately if available, background-update regardless
          return cached || networkFetch;
        })
      )
    );
    return;
  }
  // Everything else — just fetch normally (Firebase API calls, etc.)
});
