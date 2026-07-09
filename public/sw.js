/**
 * Ellines Haven Service Worker
 *
 * HOW UPDATES REACH EVERY DEVICE:
 * 1. Every build stamps a unique CACHE_NAME via vite.config.js stampServiceWorker plugin.
 * 2. The registration URL is /sw.js?v=BUILD_STAMP — stamped at build time.
 *    A changed query string = browser always treats it as a NEW script.
 * 3. New SW calls self.skipWaiting() immediately on install.
 * 4. Activate wipes all old caches.
 * 5. clients.claim() takes control of all open tabs instantly.
 * 6. The page listens for 'controllerchange' and reloads once.
 *
 * CACHING STRATEGY:
 *  - HTML navigation  → network-only, never cached
 *  - /assets/**       → cache-first (Vite content-hashes filenames)
 *  - /sw.js           → never cached
 *  - images/fonts     → network-first with cache fallback
 *  - everything else  → pass through to network
 */

const CACHE_NAME = 'ellines-haven-BUILD_STAMP'; // replaced at build time

const STATIC_ASSETS = ['/favicon.svg'];

// ── Install: skip waiting immediately ────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

// ── Activate: wipe all OLD caches, claim tabs ─────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Message handler ───────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  // HTML navigation: always network, never cache
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

  // /assets/** — cache-first (content-hashed, safe to cache forever)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          // If server returns HTML for a JS/CSS file, it means the asset no longer exists
          // (deploy rollover). Tell the page to reload so it picks up the new index.html.
          if (res.ok && res.status === 200) {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('text/html') && (
              url.pathname.endsWith('.js') || url.pathname.endsWith('.css')
            )) {
              // Asset hash mismatch — send a special reload response
              return new Response(
                `// Stale asset — reloading\nif(typeof self==='undefined')window.location.reload();`,
                { status: 200, headers: { 'Content-Type': 'application/javascript' } }
              );
            }
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // Images / fonts — network-first, fall back to cache
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

  // Everything else — pass through
});
