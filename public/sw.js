/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  ELLINES HAVEN — Service Worker (MINIMAL, SAFE)            ║
 * ║                                                             ║
 * ║  This SW is EXTREMELY conservative to prevent cache issues:║
 * ║   • DOES NOT cache anything (let Cloudflare handle it)     ║
 * ║   • Only provides offline fallback for navigation          ║
 * ║   • Clears all caches on every activation                  ║
 * ║   • Never intercepts /assets/ or anything critical         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const CACHE_NAME = 'ellines-haven-BUILD_STAMP';

// ── Install: skip waiting ────────────────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate: clear ALL caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Delete everything — start fresh
    caches.keys().then(keys => 
      Promise.all(keys.map(k => {
        console.log('[SW] Deleting cache:', k);
        return caches.delete(k);
      }))
    ).then(() => {
      console.log('[SW] All caches cleared, claiming clients');
      return self.clients.claim();
    })
  );
});

// ── Fetch: MINIMAL interception — almost everything passes through ──────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET requests for same-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return; // pass through
  }

  // NEVER touch:
  // - /sw.js itself
  // - /assets/* (Cloudflare CDN handles this)
  // - Any critical assets
  if (
    url.pathname === '/sw.js' ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.includes('.')  // anything with extension (js, css, json, etc)
  ) {
    return; // pass through to network/CDN
  }

  // HTML navigation (routes like /, /library, /admin) — fetch fresh, never cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          // NEVER cache HTML
          return response;
        })
        .catch(() => {
          // Offline: show simple fallback
          return new Response(
            '<!doctype html><html><body style="background:#0d0d1a;color:#f0ece2;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px"><h2 style="color:#c9a84c">You are offline</h2><p>Reconnect to continue.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // Everything else: pass through to network
  // (images, fonts, API calls, etc. — let browser handle caching)
});
