/**
 * Ellines Haven Service Worker
 *
 * Strategy:
 *  - HTML navigation  → network-FIRST always (never serve stale HTML)
 *  - /assets/**       → cache-first (content-hashed, never stale)
 *  - images/fonts     → stale-while-revalidate
 *
 * CACHE_NAME is auto-stamped with a build timestamp by vite.config.js on every
 * production build, so every deploy gets a brand-new cache key.
 * Old caches are wiped on activate — no stale chunks ever.
 *
 * On activation the SW posts { type: 'SW_UPDATED' } to all open tabs so the
 * app can show a "New version available — refresh" banner.
 */

const CACHE_NAME = 'ellines-haven-20260707'; // replaced at build time by stamp-sw plugin

const SHELL_ASSETS = [
  '/logo-icon.png',
  '/favicon.svg',
];

// ── Install: pre-cache minimal shell (NOT index.html — always fetch fresh) ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {})
    )
  );
  // Take control immediately — don't wait for old SW to die
  self.skipWaiting();
});

// ── Activate: delete ALL stale caches, claim clients ────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => {
            console.log('[SW] Deleting stale cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
      .then(() => {
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

  // ── HTML navigation: ALWAYS network-first, never serve stale HTML ─────────
  // This is critical — stale index.html causes blank/loading screens after deploy
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() =>
          // Offline only: serve cached index.html if available
          caches.match('/index.html').then((r) => r || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // ── Content-hashed /assets/**: cache-first (filenames change on each build) 
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
            .catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
    return;
  }
  // Everything else — fetch normally (Firebase API calls, Cloud Functions, etc.)
});
