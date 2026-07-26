import { useState, useEffect } from 'react';
import './PWAInstallPrompt.css';
import {
  getDeferredInstallPrompt,
  getPwaInstalled,
  promptPwaInstall,
  subscribePwaBootstrap,
  markPwaInstalled,
} from '../utils/pwaBootstrap';

/**
 * PWA Install Prompt — custom UI that calls beforeinstallprompt.prompt()
 * on a user gesture (required after preventDefault in pwaBootstrap).
 */

let _deferredPrompt = getDeferredInstallPrompt();
let _isInstalled = getPwaInstalled();
let _subscribers = [];

export function subscribePWA(fn) {
  _subscribers.push(fn);
  return () => { _subscribers = _subscribers.filter((s) => s !== fn); };
}

function notifySubscribers() {
  _subscribers.forEach((fn) => fn({ deferredPrompt: _deferredPrompt, isInstalled: _isInstalled }));
}

export function usePWAInstall() {
  const [state, setState] = useState({ deferredPrompt: _deferredPrompt, isInstalled: _isInstalled });
  useEffect(() => {
    const unsubLocal = subscribePWA(setState);
    const unsubBoot = subscribePwaBootstrap(({ deferredPrompt, isInstalled }) => {
      _deferredPrompt = deferredPrompt;
      _isInstalled = isInstalled;
      setState({ deferredPrompt, isInstalled });
      notifySubscribers();
    });
    return () => { unsubLocal(); unsubBoot(); };
  }, []);
  return state;
}

export async function triggerPWAInstall() {
  const accepted = await promptPwaInstall();
  _deferredPrompt = getDeferredInstallPrompt();
  _isInstalled = getPwaInstalled();
  notifySubscribers();
  return accepted;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

const SESSION_DISMISSED_KEY = 'eh_pwa_prompt_dismissed';

export default function PWAInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [canInstall, setCanInstall] = useState(!!getDeferredInstallPrompt());

  useEffect(() => {
    if (getPwaInstalled()) {
      _isInstalled = true;
      notifySubscribers();
      return;
    }

    const dismissedThisSession = sessionStorage.getItem(SESSION_DISMISSED_KEY);

    const showBanner = () => {
      if (sessionStorage.getItem(SESSION_DISMISSED_KEY)) return;
      if (getPwaInstalled()) return;
      setVisible(true);
    };

    const onReady = () => {
      _deferredPrompt = getDeferredInstallPrompt();
      setCanInstall(!!_deferredPrompt);
      notifySubscribers();
      // Show custom UI promptly so the user can call prompt() (satisfies Chrome)
      if (!dismissedThisSession) {
        // Small delay so first paint isn't blocked; keep under ~1s
        setTimeout(showBanner, 800);
      }
    };

    if (getDeferredInstallPrompt()) onReady();
    window.addEventListener('eh:pwa-ready', onReady);

    if (isIOS() && !dismissedThisSession) {
      setTimeout(showBanner, 800);
    }

    const unsub = subscribePwaBootstrap(({ deferredPrompt, isInstalled }) => {
      _deferredPrompt = deferredPrompt;
      _isInstalled = isInstalled;
      setCanInstall(!!deferredPrompt);
      if (isInstalled) setVisible(false);
      notifySubscribers();
    });

    return () => {
      window.removeEventListener('eh:pwa-ready', onReady);
      unsub();
    };
  }, []);

  const handleInstall = async () => {
    if (isIOS()) {
      setShowIOSGuide(true);
      return;
    }
    setVisible(false);
    sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
    const accepted = await promptPwaInstall();
    _deferredPrompt = getDeferredInstallPrompt();
    _isInstalled = getPwaInstalled();
    if (accepted) markPwaInstalled();
    notifySubscribers();
  };

  const handleLater = () => {
    setVisible(false);
    sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
    // Keep deferred prompt for Navbar "Install" — user can still call prompt()
  };

  if (_isInstalled || getPwaInstalled()) return null;

  return (
    <>
      {visible && (
        <div className="pwa-install-prompt" role="dialog" aria-label="Install Ellines Haven">
          <div className="pwa-install-content">
            <div className="pwa-install-icon" aria-hidden="true">📱</div>
            <div className="pwa-install-text">
              <h3>Install Ellines Haven</h3>
              <p>Add Ellines Haven to your home screen for quick access to African stories, anytime.</p>
              <div className="pwa-benefits">
                <span>✓ Offline reading</span>
                <span>✓ Fast access</span>
                <span>✓ Home screen icon</span>
              </div>
            </div>
            <div className="pwa-install-actions">
              <button
                type="button"
                className="pwa-btn-install"
                onClick={handleInstall}
                disabled={!isIOS() && !canInstall && !getDeferredInstallPrompt()}
              >
                Install
              </button>
              <button type="button" className="pwa-btn-dismiss" onClick={handleLater}>
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {showIOSGuide && (
        <div className="notification-guide" onClick={() => setShowIOSGuide(false)}>
          <div className="notification-guide-content" onClick={(e) => e.stopPropagation()}>
            <div className="notification-guide-header">
              <h3>Add to Home Screen</h3>
              <button type="button" className="close-btn" onClick={() => setShowIOSGuide(false)} aria-label="Close">✕</button>
            </div>
            <div className="notification-guide-body">
              <p className="guide-intro">Install Ellines Haven on your iPhone/iPad:</p>
              <div className="guide-steps">
                <div className="step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Tap the Share button</h4>
                    <p>At the bottom of Safari, tap the Share icon</p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Tap &quot;Add to Home Screen&quot;</h4>
                    <p>Scroll the share menu and choose Add to Home Screen</p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>Tap &quot;Add&quot;</h4>
                    <p>Confirm in the top right corner</p>
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-close-guide"
              onClick={() => {
                setShowIOSGuide(false);
                setVisible(false);
                sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
