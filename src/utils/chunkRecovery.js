/**
 * Shared recovery for Vite code-split chunk failures after a deploy.
 *
 * Old tabs keep a JS graph that imports hashed files like FAQ-XXXX.js.
 * After redeploy those files 404 → dynamic import throws → without recovery
 * RootErrorBoundary hard-crashes the app.
 */

const RELOAD_KEY = 'eh_chunk_reload';
const RELOAD_COOLDOWN_MS = 60_000;

export function isChunkLoadError(err) {
  const msg = String(err?.message || err || '');
  return (
    err?.name === 'ChunkLoadError' ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('Unable to preload CSS') ||
    msg.includes('error loading CSS') ||
    /MIME type .* text\/html/i.test(msg) ||
    /Unexpected token '<'/.test(msg)
  );
}

export function hardReload() {
  if (typeof window === 'undefined' || window.__EH_RELOADING__) return;
  window.__EH_RELOADING__ = true;

  // Do NOT clear rate-limit keys here — that would allow infinite reload loops
  // when the fresh HTML still cannot load chunks.

  const bust = () => {
    window.location.replace(
      window.location.pathname + '?_eh=' + Date.now() + (window.location.hash || '')
    );
  };

  const cleanup = Promise.all([
    'serviceWorker' in navigator
      ? navigator.serviceWorker.getRegistrations().then((regs) =>
          Promise.all(regs.map((r) => r.unregister()))
        )
      : Promise.resolve(),
    'caches' in window
      ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      : Promise.resolve(),
  ]);

  const clearTimer = setTimeout(bust, 600);
  cleanup
    .then(() => {
      clearTimeout(clearTimer);
      bust();
    })
    .catch(() => {
      clearTimeout(clearTimer);
      bust();
    });
}

/** Returns true if a hard reload was scheduled. */
export function tryRecoverFromChunkError() {
  if (typeof window === 'undefined' || window.__EH_RELOADING__) return false;
  if (window.location.pathname.startsWith('/read')) return false;

  try {
    const last = parseInt(localStorage.getItem(RELOAD_KEY) || '0', 10);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    localStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // localStorage blocked — still attempt one reload
  }

  setTimeout(() => hardReload(), 0);
  return true;
}

/**
 * React.lazy wrapper: one import retry, then cache-busting reload on chunk failure.
 * Falls through with the original error if recovery is blocked (cooldown / /read).
 */
export function lazyRetry(factory) {
  return () =>
    factory().catch((err) => {
      if (!isChunkLoadError(err)) throw err;

      // Brief retry in case of a transient network blip (not a missing hash).
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          factory().then(resolve).catch((err2) => {
            if (isChunkLoadError(err2) && tryRecoverFromChunkError()) {
              // Keep the Suspense tree pending while navigation starts.
              resolve(new Promise(() => {}));
              return;
            }
            reject(err2);
          });
        }, 400);
      });
    });
}
