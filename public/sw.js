/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  ELLINES HAVEN — Service Worker                             ║
 * ║                                                             ║
 * ║  HOSTING: Cloudflare Pages (CDN handles asset caching)     ║
 * ║  This SW is intentionally minimal:                         ║
 * ║   • Never caches /assets/ — Cloudflare CDN does this       ║
 * ║   • Never caches HTML — always fetch fresh from CDN        ║
 * ║   • Only caches images/fonts as offline fallback           ║
 * ║   • Wipes itself clean on every update (new CACHE_NAME)    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * CACHE_NAME is replaced at build time by vite.config.js stampServiceWorker.
 * The SW registration URL /sw.js?v=BUILD_STAMP changes every deploy,
 * so the browser always treats it as a new script — no 24h throttle.
 */

const CACHE_NAME = 'ellines-haven-BUILD_STAMP';

// ── Install: skip waiting immediately ────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate: wipe ALL old caches, claim all tabs ──────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Message handler ───────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Fetch: minimal interception ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GETs
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Never intercept sw.js itself
  if (url.pathname === '/sw.js') return;

  // ── HTML navigation: always network, never cache ──────────────────────────
  // Cloudflare Pages serves the latest index.html — never stale
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => new Response(
          '<!doctype html><html><body style="background:#0d0d1a;color:#f0ece2;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px"><h2 style="color:#c9a84c">You are offline</h2><p>Reconnect to continue reading.</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html' } }
        ))
    );
    return;
  }

  // ── /assets/** — PASS THROUGH, never cache ───────────────────────────────
  // Cloudflare CDN caches these with immutable headers.
  // Caching them in SW causes stale chunk errors after every deploy.
  if (url.pathname.startsWith('/assets/')) {
    return; // let the browser fetch directly from Cloudflare CDN
  }

  // ── Images/fonts — network-first, cache as offline fallback ─────────────
  if (/\.(png|jpg|jpeg|svg|webp|woff2|woff|ico|gif)(\?.*)?$/.test(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else — pass through to network
});
