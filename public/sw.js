/**
 * Ellines Haven Service Worker
 *
 * Update flow — fully automatic, works on all devices including iOS Safari:
 *  1. Every deploy stamps a new CACHE_NAME timestamp via vite.config.js
 *  2. Browser fetches sw.js (served with no-cache header from Firebase Hosting)
 *  3. New SW installs → receives SKIP_WAITING message → activates immediately
 *  4. controllerchange fires → page auto-reloads → user gets fresh code
 *  No banner. No manual tap. Happens within 30 seconds of any deploy.
 *
 * Caching strategy:
 *  - HTML navigation  → ALWAYS network (never cached — stale HTML = broken app)
 *  - /assets/**       → cache-first  (content-hashed filenames, safe to cache forever)
 *  - images/fonts     → stale-while-revalidate
 */

const CACHE_NAME = 'ellines-haven-20260707'; // replaced at build time by stamp-sw plugin

const STATIC_ASSETS = [
  '/logo-icon.png',
  '/favicon.svg',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  // Pre-cache only truly static assets (not index.html)
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  // Do NOT self.skipWaiting() here — let the registration code trigger it
  // via the SKIP_WAITING message so we can reload cleanly
});

// ── Message: SKIP_WAITING — triggered by registration code on update ──────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Activate: wipe all old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // ── HTML navigation: ALWAYS network-first, never cache ───────────────────
  // Stale index.html is the #1 cause of blank/loading-stuck screens after deploy
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() =>
          // Offline fallback only
          caches.match('/index.html')
            .then(r => r || new Response('Offline — please reconnect', { status: 503 }))
        )
    );
    return;
  }

  // ── /assets/** — cache-first (Vite content-hashes filenames on every build) ─
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, res.clone()))
              .catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // ── Images / fonts — stale-while-revalidate ───────────────────────────────
  if (/\.(png|jpg|jpeg|svg|webp|woff2|woff|ico|gif)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const fresh = fetch(request)
            .then(res => {
              if (res.ok) cache.put(request, res.clone()).catch(() => {});
              return res;
            })
            .catch(() => cached);
          return cached || fresh;
        })
      )
    );
    return;
  }
  // Everything else: pass through (Firebase calls, Cloud Functions, etc.)
});
