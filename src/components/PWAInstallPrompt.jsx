import { useState, useEffect } from 'react';
import './PWAInstallPrompt.css';

/**
 * PWA Install Prompt Component
 * Shows users they can install Ellines Haven as an app
 * Also displays notification permissions guide
 */
export default function PWAInstallPrompt() {
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showNotificationGuide, setShowNotificationGuide] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show install prompt after 3 seconds on first visit
      setTimeout(() => {
        setShowInstallPrompt(true);
      }, 3000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if install was successful
    window.addEventListener('appinstalled', () => {
      console.log('✅ PWA installed successfully');
      setIsInstalled(true);
      setShowInstallPrompt(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log(`User response to install prompt: ${outcome}`);
    
    if (outcome === 'accepted') {
      setShowInstallPrompt(false);
      setIsInstalled(true);
    } else {
      setShowInstallPrompt(false);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
  };

  if (isInstalled && !showNotificationGuide) {
    return null;
  }

  return (
    <>
      {/* Install Prompt */}
      {showInstallPrompt && !isInstalled && (
        <div className="pwa-install-prompt">
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
              <button className="pwa-btn-install" onClick={handleInstallClick}>
                Install
              </button>
              <button className="pwa-btn-dismiss" onClick={handleDismiss}>
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Guide */}
      {isInstalled && showNotificationGuide && (
        <div className="notification-guide">
          <div className="notification-guide-content">
            <div className="notification-guide-header">
              <h3>🔔 Enable Notifications</h3>
              <button 
                className="close-btn"
                onClick={() => setShowNotificationGuide(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="notification-guide-body">
              <p className="guide-intro">
                Get notified about new releases and special offers!
              </p>

              <div className="guide-steps">
                <div className="step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Look for the Notification Icon</h4>
                    <p>In the top right of your screen, tap the bell icon 🔔</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Tap "Allow"</h4>
                    <p>When asked for permission, tap "Allow" to receive notifications</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>You're All Set!</h4>
                    <p>You'll now receive notifications about new books and special announcements</p>
                  </div>
                </div>
              </div>

              <div className="notification-benefits">
                <h4>What you'll get notified about:</h4>
                <ul>
                  <li>📚 New book releases</li>
                  <li>🎉 Special promotions & discounts</li>
                  <li>📣 Important announcements</li>
                  <li>✨ Author updates</li>
                </ul>
              </div>

              <div className="guide-footer">
                <p className="text-muted">
                  You can change notification settings anytime in your app or browser settings
                </p>
              </div>
            </div>

            <button 
              className="btn-close-guide"
              onClick={() => setShowNotificationGuide(false)}
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Notification Button (when installed) */}
      {isInstalled && (
        <button 
          className="notification-guide-toggle"
          onClick={() => setShowNotificationGuide(!showNotificationGuide)}
          title="How to enable notifications"
        >
          🔔
        </button>
      )}
    </>
  );
}
