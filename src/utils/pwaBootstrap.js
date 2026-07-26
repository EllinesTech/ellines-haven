/**
 * Capture beforeinstallprompt as early as possible (before React mounts).
 * Chrome fires this once; if we miss it, Install never works and DevTools
 * complains that preventDefault ran without a later prompt().
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
    // Required to use a custom install UI and call prompt() later.
    e.preventDefault();
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
  promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  if (outcome === 'accepted') {
    markPwaInstalled();
    return true;
  }
  // Choice made — event cannot be reused
  clearDeferredInstallPrompt();
  return false;
}
