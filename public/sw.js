/**
 * Ellines Haven Service Worker — Bulletproof Update Strategy
 *
 * HOW UPDATES REACH EVERY DEVICE:
 *
 * 1. Every build stamps a unique CACHE_NAME (e.g. ellines-haven-202607091828)
 *    via vite.config.js stampServiceWorker plugin.
 *
 * 2. The registration URL is /sw.js?v=202607091828 — stamped at build time.
 *    A changed query string = browser always treats it as a NEW script,
 *    bypassing the browser's 24-hour SW update throttle entirely.
 *
 * 3. New SW calls self.skipWaiting() immediately on install — no waiting,
 *    no banner, no user tap required.
 *
 * 4. Activate wipes ALL old caches — no stale assets survive.
 *
 * 5. clients.claim() takes control of all open tabs instantly.
 *
 * 6. The page listens for 'controllerchange' and reloads — users always
 *    get the newest code within one page load.
 *
 * CACHING STRATEGY (safe for continuous deployment):
 *  - HTML navigation  → ALWAYS network-only, never cached
 *  - /assets/**       → cache-first (Vite content-hashes filenames — old
 *                        hashes simply never requested after an update)
 *  - /sw.js           → NEVER cached (passes through, no SW intercept)
 *  - images/fonts     → network-first with cache fallback (always fresh)
 *  - everything else  → pass through to network
 */

const CACHE_NAME = 'ellines-haven-BUILD_STAMP'; // replaced at build time by stamp-sw plugin

const STATIC_ASSETS = [
  '/favicon.svg',
];

// ── Install: cache static assets + skip waiting immediately ──────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  // Take control immediately — don't wait for existing SW to finish.
  // Safe because Vite content-hashes all /assets/ filenames.
  self.skipWaiting();
});

// ── Activate: wipe EVERY old cache, then claim all open tabs ─────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // Take control of all open pages now
  );
});

// ── Message handler (belt-and-suspenders) ─────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GETs
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // ── Never cache sw.js itself ──────────────────────────────────────────────
  if (url.pathname === '/sw.js') return;

  // ── HTML navigation: network-only, never serve from cache ────────────────
  // Stale HTML is the #1 cause of users stuck on old versions.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() =>
          caches.match('/index.html')
            .then(r => r || new Response(
              '<h1>You are offline</h1><p>Reconnect to continue reading.</p>',
              { status: 503, headers: { 'Content-Type': 'text/html' } }
            ))
        )
    );
    return;
  }

  // ── /assets/** — cache-first (content-hashed, safe to cache forever) ─────
  // Old asset hashes are never requested after a deploy — no staleness risk.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // ── Images / fonts — network-first, fall back to cache ───────────────────
  // Network-first ensures users always get the latest logo/cover images.
  if (/\.(png|jpg|jpeg|svg|webp|woff2|woff|ico|gif)(\?.*)?$/.test(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(res => {
          if (res.ok && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else (Firebase, Paystack, etc.) — pass through
});
