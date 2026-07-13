import { useState, useEffect } from 'react';
import './PWAInstallPrompt.css';

/**
 * PWA Install Prompt
 *
 * Rules:
 * - Shows to EVERYONE (guests + logged-in) who hasn't installed the app
 * - Uses `beforeinstallprompt` (Chrome/Android) OR a manual iOS fallback
 * - Does NOT show on page reload within the same session (sessionStorage flag)
 * - "Later" dismisses for the entire session; next fresh session it may appear again
 * - Exposes a `usePWAInstall` hook so the Navbar can show an "Install" button
 *   for users who previously clicked "Later"
 */

// ── Shared state so Navbar can read install availability ──────────────────────
let _deferredPrompt = null;
let _isInstalled    = false;
let _subscribers    = [];

export function subscribePWA(fn) {
  _subscribers.push(fn);
  return () => { _subscribers = _subscribers.filter(s => s !== fn); };
}

function notifySubscribers() {
  _subscribers.forEach(fn => fn({ deferredPrompt: _deferredPrompt, isInstalled: _isInstalled }));
}

// ── Hook for Navbar / other components ───────────────────────────────────────
export function usePWAInstall() {
  const [state, setState] = useState({ deferredPrompt: _deferredPrompt, isInstalled: _isInstalled });
  useEffect(() => subscribePWA(setState), []);
  return state;
}

// ── Trigger install from anywhere (e.g. Navbar button) ───────────────────────
export async function triggerPWAInstall() {
  if (!_deferredPrompt) return false;
  _deferredPrompt.prompt();
  const { outcome } = await _deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    _isInstalled = true;
    _deferredPrompt = null;
    notifySubscribers();
  }
  return outcome === 'accepted';
}

// ── Is iOS? (no beforeinstallprompt support) ─────────────────────────────────
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// ── Is app already installed? ─────────────────────────────────────────────────
function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

// ── Session key — once dismissed per session, don't re-show ──────────────────
const SESSION_DISMISSED_KEY = 'eh_pwa_prompt_dismissed';

export default function PWAInstallPrompt() {
  const [visible,       setVisible]       = useState(false);
  const [hasDeferred,   setHasDeferred]   = useState(false);
  const [showIOSGuide,  setShowIOSGuide]  = useState(false);

  useEffect(() => {
    // Already installed as PWA — never show
    if (isStandalone()) {
      _isInstalled = true;
      notifySubscribers();
      return;
    }

    // Dismissed this session — don't re-show the banner, but still capture the prompt
    const dismissedThisSession = sessionStorage.getItem(SESSION_DISMISSED_KEY);

    // Capture beforeinstallprompt (Chrome / Android / Edge)
    const onBeforeInstall = (e) => {
      e.preventDefault();
      _deferredPrompt = e;
      setHasDeferred(true);
      notifySubscribers();

      // Only auto-show after 3s on first load of a fresh session
      if (!dismissedThisSession) {
        setTimeout(() => setVisible(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS fallback — show a manual "Add to Home Screen" guide
    if (isIOS() && !dismissedThisSession) {
      // Only show on first visit of session, with a 3s delay
      setTimeout(() => setVisible(true), 3000);
    }

    // Detect successful install
    const onInstalled = () => {
      _isInstalled = true;
      _deferredPrompt = null;
      setVisible(false);
      setHasDeferred(false);
      notifySubscribers();
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (isIOS()) {
      setShowIOSGuide(true);
      return;
    }
    if (!_deferredPrompt) return;
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      _isInstalled = true;
      _deferredPrompt = null;
      notifySubscribers();
    }
    setVisible(false);
    sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
  };

  const handleLater = () => {
    setVisible(false);
    // Mark dismissed for this session — won't re-appear on reload
    sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
  };

  // Don't render if installed
  if (_isInstalled) return null;

  return (
    <>
      {/* ── Main install banner ─────────────────────────────────── */}
      {visible && (
        <div className="pwa-install-prompt" role="dialog" aria-label="Install Ellines Haven">
          <div className="pwa-install-content">
            <div className="pwa-install-icon">📱</div>
            <div className="pwa-install-text">
              <h3>📖 Install Ellines Haven</h3>
              <p>Add Ellines Haven to your home screen for quick access to African stories, anytime.</p>
              <div className="pwa-benefits">
                <span>✓ Offline reading</span>
                <span>✓ Fast access</span>
                <span>✓ Home screen icon</span>
              </div>
            </div>
            <div className="pwa-install-actions">
              <button className="pwa-btn-install" onClick={handleInstall}>
                Install
              </button>
              <button className="pwa-btn-dismiss" onClick={handleLater}>
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── iOS "Add to Home Screen" guide ─────────────────────── */}
      {showIOSGuide && (
        <div className="notification-guide" onClick={() => setShowIOSGuide(false)}>
          <div className="notification-guide-content" onClick={e => e.stopPropagation()}>
            <div className="notification-guide-header">
              <h3>📲 Add to Home Screen</h3>
              <button className="close-btn" onClick={() => setShowIOSGuide(false)} aria-label="Close">✕</button>
            </div>
            <div className="notification-guide-body">
              <p className="guide-intro">Install Ellines Haven on your iPhone/iPad in two taps:</p>
              <div className="guide-steps">
                <div className="step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Tap the Share button</h4>
                    <p>At the bottom of Safari, tap the Share icon <strong>⬆</strong></p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Tap "Add to Home Screen"</h4>
                    <p>Scroll down in the share menu and tap <strong>Add to Home Screen</strong></p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>Tap "Add"</h4>
                    <p>Confirm by tapping <strong>Add</strong> in the top right corner</p>
                  </div>
                </div>
              </div>
            </div>
            <button className="btn-close-guide" onClick={() => { setShowIOSGuide(false); setVisible(false); sessionStorage.setItem(SESSION_DISMISSED_KEY, '1'); }}>
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
