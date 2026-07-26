/**
 * PWA install bootstrap.
 *
 * Do NOT call beforeinstallprompt.preventDefault() — Chrome then logs on every
 * page: "Banner not shown: beforeinstallpromptevent.preventDefault() called..."
 * and the mini-infobar stays hidden until prompt() runs.
 *
 * We still listen so the app can detect installability / installed state.
 * Custom Install buttons use the browser’s own UI (or prompt() when available).
 */

let deferredPrompt = null;
let installed = false;
const listeners = new Set();

function notify() {
  const snapshot = { deferredPrompt, isInstalled: installed };
  listeners.forEach((fn) => {
    try { fn(snapshot); } catch { /* ignore */ }
  });
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

if (typeof window !== 'undefined') {
  if (isStandalone()) {
    installed = true;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    // Intentionally no e.preventDefault() — keeps Chrome's native install UI
    // and avoids the DevTools "Banner not shown" warning on every route.
    deferredPrompt = e;
    window.__EH_DEFERRED_INSTALL__ = e;
    notify();
    window.dispatchEvent(new CustomEvent('eh:pwa-ready'));
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    window.__EH_DEFERRED_INSTALL__ = null;
    notify();
  });
}

export function getDeferredInstallPrompt() {
  return deferredPrompt || (typeof window !== 'undefined' ? window.__EH_DEFERRED_INSTALL__ : null) || null;
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null;
  if (typeof window !== 'undefined') window.__EH_DEFERRED_INSTALL__ = null;
  notify();
}

export function getPwaInstalled() {
  return installed || (typeof window !== 'undefined' && isStandalone());
}

export function markPwaInstalled() {
  installed = true;
  clearDeferredInstallPrompt();
}

export function subscribePwaBootstrap(fn) {
  listeners.add(fn);
  fn({ deferredPrompt: getDeferredInstallPrompt(), isInstalled: getPwaInstalled() });
  return () => listeners.delete(fn);
}

export async function promptPwaInstall() {
  const promptEvent = getDeferredInstallPrompt();
  if (!promptEvent || typeof promptEvent.prompt !== 'function') return false;
  try {
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      markPwaInstalled();
      return true;
    }
  } catch {
    // Browser already showed native UI / event consumed — fine
  }
  clearDeferredInstallPrompt();
  return false;
}
