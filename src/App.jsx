/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ELLINES HAVEN ARCHITECTURE - IMPORTANT                                  ║
 * ║  BUILD: 20260711-GODMODE-SW-KILLED                                       ║
 * ║                                                                          ║
 * ║  🌐 HOSTING: Cloudflare Pages (haven.ellines.co.ke)                     ║
 * ║    - Static website hosting with global CDN                             ║
 * ║    - Auto-deploys from Git pushes to main branch                        ║
 * ║    - Handles all static assets (HTML, JS, CSS, images)                  ║
 * ║    - Cloudflare handles caching and CDN distribution                    ║
 * ║                                                                          ║
 * ║  🔥 FIREBASE: Database ONLY (ellines.haven@gmail.com)                   ║
 * ║    - Firestore: Document database for all site data                     ║
 * ║    - Firebase Auth: User authentication and management                  ║
 * ║    - Cloud Functions: Server-side logic (M-Pesa, Paystack, etc.)       ║
 * ║    - Cloud Storage: File uploads (book covers, user avatars)            ║
 * ║    - Firebase does NOT host the website - only provides backend        ║
 * ║                                                                          ║
 * ║  🚀 DEPLOYMENT FLOW:                                                    ║
 * ║    Code → Git Push → Cloudflare Pages → haven.ellines.co.ke             ║
 * ║                                                                          ║
 * ║  ⚡ CHUNK ERROR PROTECTION:                                             ║
 * ║    - Service Worker: Never caches /assets/ (lets CDN handle)            ║
 * ║    - Global Handler: Auto-reloads on chunk errors before React mounts  ║
 * ║    - ChunkErrorBoundary: React-level protection with user-friendly UI  ║
 * ║    - Never interrupts readers: Skip auto-reload when on /read pages     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef, lazy, Suspense, Component } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LanguageProvider } from './context/LanguageContext';
import { EditModeProvider, useEditMode } from './context/EditModeContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import WelcomePrompt from './components/WelcomePrompt';
import EllineaAI from './components/EllineaAI';
import EditToolbar from './components/EditToolbar';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { initializeActivityLogger } from './utils/reliableActivityLogger';

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

import './App.css';

/* ── Reliable reload helper — clears all SW caches then hard-reloads ─────────
   Works on iOS Safari, Android Chrome, and all desktop browsers.
   The setTimeout(0) ensures reload fires even if caches.keys() is slow.
────────────────────────────────────────────────────────────────────────── */
function hardReload() {
  localStorage.removeItem('eh_chunk_reload');
  if ('caches' in window) {
    // Start cache clearing but don't wait — reload regardless after 600ms
    const clearTimer = setTimeout(() => window.location.reload(), 600);
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => { clearTimeout(clearTimer); window.location.reload(); })
      .catch(() => { clearTimeout(clearTimer); window.location.reload(); });
  } else {
    window.location.reload();
  }
}

/* ── Chunk error boundary — auto-reloads on stale deploy cache ──────────────
   Only triggers full-page fallback for true chunk/module-load errors.
   React component render errors are caught by PageErrorBoundary below,
   which shows a recoverable inline error instead of blocking the whole app.
────────────────────────────────────────────────────────────────────────── */
class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }
  static getDerivedStateFromError(err) {
    const isChunkError =
      err?.name === 'ChunkLoadError' ||
      (err?.message || '').includes('Failed to fetch dynamically imported module') ||
      (err?.message || '').includes('Importing a module script failed') ||
      (err?.message || '').includes('error loading dynamically imported module');

    if (isChunkError) {
      const reloadKey = 'eh_chunk_reload';
      const last = parseInt(localStorage.getItem(reloadKey) || '0', 10);
      const isReading = typeof window !== 'undefined' && window.location.pathname.startsWith('/read');
      if (!isReading && Date.now() - last > 60_000) {
        localStorage.setItem(reloadKey, String(Date.now()));
        // Use setTimeout so the state update finishes before reload fires
        setTimeout(() => hardReload(), 0);
        return { hasError: false, isChunkError: false };
      }
      return { hasError: true, isChunkError: true };
    }

    // Non-chunk React errors — let PageErrorBoundary (nested) handle them.
    // Only set hasError if this is a top-level catch (no child boundary caught it).
    return { hasError: true, isChunkError: false };
  }
  render() {
    if (this.state.hasError && this.state.isChunkError) {
      // True chunk/network error — show a minimal non-blocking update banner
      return (
        <>
          {/* Still render children (may be partially working) */}
          {this.props.children}
          {/* Floating update banner — doesn't block the page */}
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 99999, background: '#1a1a2e', border: '1px solid rgba(201,168,76,0.4)',
            borderRadius: 10, padding: '14px 24px', display: 'flex',
            alignItems: 'center', gap: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            maxWidth: 420, width: 'calc(100% - 32px)',
          }}>
            <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>⚡</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#c9a84c', fontSize: '0.9rem', display: 'block' }}>Update available</strong>
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem' }}>Refresh to get the latest version</span>
            </div>
            <button
              style={{
                padding: '7px 16px', background: '#c9a84c', color: '#000',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontWeight: 700, fontSize: '0.82rem', flexShrink: 0,
                minHeight: 44, minWidth: 80, // accessible touch target
              }}
              onClick={hardReload}
            >
              Refresh
            </button>
          </div>
        </>
      );
    }
    if (this.state.hasError) {
      // Non-chunk error fell through — show minimal page-level error
      return (
        <div style={{
          minHeight: '60vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem' }}>⚠️</div>
          <h2 style={{ color: '#c9a84c', margin: 0, fontSize: '1.1rem' }}>Something went wrong</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: 320, margin: 0, fontSize: '0.85rem' }}>
            An unexpected error occurred. Try refreshing the page.
          </p>
          <button
            style={{
              marginTop: 8, padding: '9px 24px', background: '#c9a84c',
              color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer',
              fontWeight: 700, fontSize: '0.87rem', minHeight: 44,
            }}
            onClick={hardReload}
          >
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Page-level error boundary — wraps individual pages so one broken page
   doesn't kill the entire app (navbar/footer remain usable). ── */
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, error: err };
  }
  componentDidCatch(err, info) {
    console.error('[PageErrorBoundary]', err, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem' }}>⚠️</div>
          <h2 style={{ color: '#c9a84c', margin: 0, fontSize: '1.1rem' }}>
            {this.props.label || 'This section failed to load'}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: 340, margin: 0, fontSize: '0.83rem' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            style={{
              marginTop: 8, padding: '9px 22px', background: 'rgba(201,168,76,0.12)',
              color: '#c9a84c', border: '1px solid rgba(201,168,76,0.3)',
              borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
            }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Page loading indicator ── */
function PageLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg, #0d0d1a)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
    }}>
      <img src="/pwa-icon-192.png" alt="Ellines Haven" style={{ height: 56, opacity: 0.95, animation: 'eh-pulse 1.4s ease-in-out infinite' }} />
      <div style={{ display: 'flex', gap: 7 }}>
        {[0,1,2].map(i => (
          <span key={i} style={{
            width: 8, height: 8, borderRadius: '50%', background: '#c9a84c',
            animation: `eh-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
          }} />
        ))}
      </div>
      <style>{`
        @keyframes eh-pulse { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
        @keyframes eh-bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-10px)} }
      `}</style>
    </div>
  );
}

/* ── Lazy page imports ── */
const Home         = lazy(() => import('./pages/Home'));
const Library      = lazy(() => import('./pages/Library'));
const BookDetail   = lazy(() => import('./pages/BookDetail'));
const Cart         = lazy(() => import('./pages/Cart'));
const Login        = lazy(() => import('./pages/Login'));
const Register     = lazy(() => import('./pages/Register'));
const MyLibrary    = lazy(() => import('./pages/MyLibrary'));
const Reader       = lazy(() => import('./pages/Reader'));
const About        = lazy(() => import('./pages/About'));
const Contact      = lazy(() => import('./pages/Contact'));
const Admin        = lazy(() => import('./pages/Admin'));
const Founder      = lazy(() => import('./pages/Founder'));
const UserProfile  = lazy(() => import('./pages/UserProfile'));
const AdminProfile = lazy(() => import('./pages/AdminProfile'));
const FAQ          = lazy(() => import('./pages/FAQ'));
const Terms        = lazy(() => import('./pages/Terms'));
const Privacy      = lazy(() => import('./pages/Privacy'));
const Wishlist        = lazy(() => import('./pages/Wishlist'));
const ChangePassword  = lazy(() => import('./pages/ChangePassword'));
const ReaderProfile   = lazy(() => import('./pages/ReaderProfile'));
const Recommendations = lazy(() => import('./pages/Recommendations'));

/* ── Scroll to top on route change ── */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/* ── Visitor Tracker — server-side real IP via Cloud Function (callable) ── */
function VisitorTracker() {
  const { pathname } = useLocation();
  const { user } = useApp();

  useEffect(() => {
    console.log('[VisitorTracker] Component mounted/updated, pathname:', pathname);
    
    // Skip admin and reader pages — don't track admin browsing as site visitors
    if (pathname.startsWith('/admin') || pathname.startsWith('/read')) {
      console.log('[VisitorTracker] Skipping - admin or read page');
      return;
    }

    // Track page visits with per-page cooldown (60 seconds per page per session)
    const sessionKey = 'eh_visitor_' + pathname + '_' + (user?.email || 'anon');
    const lastTracked = sessionStorage.getItem(sessionKey);
    const now = Date.now();
    
    // Only track once per page per 60 seconds
    if (lastTracked && (now - parseInt(lastTracked)) < 60000) {
      return;
    };
    // Mark this tracking attempt
    sessionStorage.setItem(sessionKey, now.toString());

    (async () => {
      try {
        // Import the tracking utility
        const { trackVisitorReliable } = await import('./utils/visitorTracker');
        console.log('[VisitorTracker] trackVisitorReliable imported successfully');

        const ua = navigator.userAgent || '';
        let device = 'Desktop';
        if (/Mobi|Android|iPhone|iPad/i.test(ua)) device = 'Mobile';
        else if (/Tablet|iPad/i.test(ua)) device = 'Tablet';
        
        const referrer = document.referrer
          ? (() => { try { return new URL(document.referrer).hostname; } catch { return document.referrer.slice(0, 100); } })()
          : 'direct';

        const trackData = {
          page: pathname,
          referrer,
          userAgent: ua.slice(0, 300),
          device,
          userEmail: user?.email || null,
          userName:  user?.name  || null,
        };

        console.log('[VisitorTracker] About to track with data:', trackData);
        
        // Use reliable tracking with retry queue
        const result = await trackVisitorReliable(trackData);
        
        console.log('[VisitorTracker] trackVisitorReliable returned:', result);
        
        if (result.success) {
          console.log('[VisitorTracker] ✅ Visit tracked successfully');
          // Cache full geo data for PresenceTracker heartbeats
          try {
            sessionStorage.setItem('eh_last_ip_data', JSON.stringify(result.data));
          } catch {}
        } else {
          console.error('[VisitorTracker] ❌ Failed to track:', result.error);
        }
      } catch (error) {
        console.error('[VisitorTracker] ❌ Unexpected error:', error);
        console.error('[VisitorTracker] Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack?.substring(0, 500)
        });
      }
    })();
  }, [pathname, user?.email]);

  return null;
}

/* ── Initialize visitor tracking queue on app start ── */
function VisitorQueueProcessor() {
  useEffect(() => {
    (async () => {
      try {
        const { processVisitorQueue } = await import('./utils/visitorTracker');
        const result = await processVisitorQueue();
        if (result.processed > 0) {
          console.log('[VisitorQueueProcessor] ✅ Processed', result.processed, 'queued visitor tracking attempts');
        }
      } catch (e) {
        console.warn('[VisitorQueueProcessor] Failed to process queue:', e);
      }
    })();
  }, []); // Run once on mount

  return null;
}

/* ── Presence Tracker — writes heartbeat to Firestore so admin can see who is online ── */
function PresenceTracker() {
  const { user } = useApp();
  const { pathname } = useLocation();

  useEffect(() => {
    // Only track logged-in users
    if (!user?.email) return;

    const presenceId = 'presence_' + user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');

    const updatePresence = async () => {
      try {
        const { doc, setDoc, serverTimestamp: svTs, collection, query, where, orderBy, limit, getDocs } = await import('firebase/firestore');
        const { db: fsDb } = await import('./firebase');
        // Try to get IP data — first from sessionStorage (set by VisitorTracker),
        // then fall back to the most recent user_sessions record
        let ipData = (() => {
          try { return JSON.parse(sessionStorage.getItem('eh_last_ip_data') || '{}'); } catch { return {}; }
        })();
        // If no IP cached yet, pull from user_sessions (written by logUserLoginServer)
        if (!ipData.ip && user?.email) {
          try {
            const sessSnap = await getDocs(
              query(collection(fsDb, 'user_sessions'),
                where('userEmail', '==', user.email.toLowerCase()),
                orderBy('loginTime', 'desc'), limit(1))
            );
            if (!sessSnap.empty) {
              const s = sessSnap.docs[0].data();
              ipData = { ip: s.ip || '', city: s.city || '', country: s.country || '', countryCode: s.countryCode || '', isp: s.isp || '', lat: s.lat || null, lon: s.lon || null, timezone: s.timezone || '' };
            }
          } catch {}
        }
        await setDoc(doc(fsDb, 'user_presence', presenceId), {
          email:      user.email.toLowerCase(),
          name:       user.name || '',
          role:       user.role || 'user',
          page:       pathname,
          lastSeen:   svTs(),
          lastSeenMs: Date.now(),
          ip:         ipData.ip    || '',
          city:       ipData.city  || '',
          country:    ipData.country || '',
          countryCode: ipData.countryCode || '',
          isp:        ipData.isp   || '',
          lat:        ipData.lat   || null,
          lon:        ipData.lon   || null,
          timezone:   ipData.timezone || '',
          device:     /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
        }, { merge: true });
      } catch (e) {
        // Non-critical — silently ignore
      }
    };

    // Update immediately, then every 30s
    updatePresence();
    const timer = setInterval(updatePresence, 30_000);
    return () => clearInterval(timer);
  }, [user?.email, pathname]);

  // Also check for forceLogout flag
  useEffect(() => {
    if (!user?.email) return;
    const presenceId = 'presence_' + user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let unsub;
    (async () => {
      try {
        const { doc, onSnapshot } = await import('firebase/firestore');
        const { db: fsDb } = await import('./firebase');
        unsub = onSnapshot(doc(fsDb, 'user_presence', presenceId), snap => {
          if (snap.exists() && snap.data()?.forceLogout) {
            // Clear the flag then logout
            import('firebase/firestore').then(({ doc: d2, setDoc: set2, serverTimestamp: svTs }) =>
              import('./firebase').then(({ db: db2 }) =>
                set2(d2(db2, 'user_presence', presenceId), { forceLogout: false }, { merge: true })
              )
            );
            localStorage.removeItem('eh_user');
            window.location.href = '/login';
          }
        });
      } catch {}
    })();
    return () => { if (unsub) unsub(); };
  }, [user?.email]);

  return null;
}

/* ── Enhanced Activity Tracker for Key User Interactions ── */
function ActivityTracker() {
  const { user, cart } = useApp();
  const { pathname } = useLocation();

  useEffect(() => {
    // Track key user interactions that indicate engagement
    const trackActivity = async (activity, details = {}) => {
      try {
        const { callTrackVisitor } = await import('./firebase');
        
        await callTrackVisitor({
          page: `${pathname}#${activity}`,
          referrer: 'user-interaction',
          userAgent: navigator.userAgent.slice(0, 300),
          device: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
          userEmail: user?.email || null,
          userName: user?.name  || null,
          activity,
          ...details
        });
      } catch (error) {
        console.warn(`[ActivityTracker] Failed to track ${activity}:`, error.message);
      }
    };

    // Track when user adds items to cart
    const cartItemCount = cart?.length || 0;
    if (cartItemCount > 0) {
      const lastCartCount = parseInt(sessionStorage.getItem('eh_last_cart_count') || '0');
      if (cartItemCount > lastCartCount) {
        trackActivity('add_to_cart', { items: cartItemCount });
        sessionStorage.setItem('eh_last_cart_count', cartItemCount.toString());
      }
    }

    // Track scroll engagement (once per session per page)
    const scrollKey = 'eh_scroll_tracked_' + pathname;
    if (!sessionStorage.getItem(scrollKey)) {
      const trackScroll = () => {
        const scrollPercent = (window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight)) * 100;
        if (scrollPercent > 50) {
          trackActivity('deep_scroll', { scroll_percent: Math.round(scrollPercent) });
          sessionStorage.setItem(scrollKey, '1');
          window.removeEventListener('scroll', trackScroll);
        }
      };
      window.addEventListener('scroll', trackScroll, { passive: true });
      return () => window.removeEventListener('scroll', trackScroll);
    }
  }, [user?.email, cart?.length, pathname]);

  return null;
}

/* ── Custom Page Renderer — renders pages created in Admin → Page Editor ── */
function CustomPageRenderer() {
  const { pathname } = useLocation();
  const editCtx = useEditMode();
  const [pageMeta, setPageMeta] = useState(null);
  const [content,  setContent]  = useState({});
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'site_data', 'custom_pages'));
        if (!snap.exists()) { setNotFound(true); setLoading(false); return; }
        const pages = snap.data().pages || [];
        const meta  = pages.find(p => p.path === pathname);
        if (!meta)  { setNotFound(true); setLoading(false); return; }
        setPageMeta(meta);
        const cs = await getDoc(doc(db, 'site_data', meta.key));
        setContent(cs.exists() ? cs.data() : {});
      } catch { setNotFound(true); }
      setLoading(false);
    })();
  }, [pathname]); // eslint-disable-line

  if (loading) return (
    <main style={{ minHeight:'60vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'var(--muted)', fontSize:'0.88rem' }}>Loading…</div>
    </main>
  );

  if (notFound) return <NotFound />;

  const cv = (editCtx?.editMode && editCtx?.pageKey === pageMeta?.key)
    ? { ...content, ...editCtx.pageData } : content;

  return (
    <main>
      <div className="page-header">
        <div className="container">
          <h1>{pageMeta.icon} <span className="gold-text">{pageMeta.label}</span></h1>
          {pageMeta.desc && <p style={{ color:'var(--muted)', marginTop:8 }}>{pageMeta.desc}</p>}
        </div>
      </div>
      <section className="section">
        <div className="container">
          <div className="card" style={{ padding:'32px 36px', maxWidth:780, margin:'0 auto', lineHeight:1.8 }}>
            {cv?.body ? (
              <div style={{ whiteSpace:'pre-wrap', color:'var(--text)' }}>{cv.body}</div>
            ) : (
              <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)' }}>
                <div style={{ fontSize:'2.5rem', marginBottom:12 }}>✏️</div>
                <p>No content yet.</p>
                <p style={{ fontSize:'0.82rem', marginTop:8 }}>
                  Admin: click the <strong style={{ color:'var(--gold)' }}>✏️ Edit Page</strong> button at the bottom to add content.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Layout({ children }) {
  return (
    <>
      <Navbar />
      <div style={{ paddingTop: 'var(--navbar-h, 90px)' }}>{children}</div>
      <Footer />
    </>
  );
}

/* ── Global site controls: right-click, DevTools, copy, print blocking ── */
function SiteControls() {
  const { siteControls } = useApp();
  useEffect(() => {
    const handlers = [];
    if (siteControls?.disableRightClick) {
      const h = e => e.preventDefault();
      document.addEventListener('contextmenu', h);
      handlers.push(() => document.removeEventListener('contextmenu', h));
    }
    if (siteControls?.disableTextSelect) {
      document.body.style.userSelect = 'none';
      handlers.push(() => { document.body.style.userSelect = ''; });
    }
    if (siteControls?.disableCopy) {
      const h = e => e.preventDefault();
      document.addEventListener('copy', h);
      document.addEventListener('cut', h);
      handlers.push(() => { document.removeEventListener('copy', h); document.removeEventListener('cut', h); });
    }
    if (siteControls?.disableDevTools) {
      const h = e => {
        if (e.key === 'F12') e.preventDefault();
        if (e.ctrlKey && e.shiftKey && ['i','j','c'].includes(e.key.toLowerCase())) e.preventDefault();
        if (e.ctrlKey && e.key.toLowerCase() === 'u') e.preventDefault();
      };
      document.addEventListener('keydown', h);
      handlers.push(() => document.removeEventListener('keydown', h));
    }
    if (siteControls?.disablePrint) {
      const h = e => { if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); e.stopPropagation(); } };
      document.addEventListener('keydown', h);
      handlers.push(() => document.removeEventListener('keydown', h));
    }
    return () => handlers.forEach(fn => fn());
  }, [siteControls]);

  if (siteControls?.disablePrint) {
    const style = document.createElement('style');
    style.id = 'eh-noprint';
    style.textContent = '@media print { body { display: none !important; } }';
    if (!document.getElementById('eh-noprint')) document.head.appendChild(style);
  } else {
    document.getElementById('eh-noprint')?.remove();
  }
  return null;
}

/* ── Cookie Consent Banner ── */
function CookieConsent() {
  const [visible, setVisible] = useState(() => {
    return !localStorage.getItem('eh_cookie_consent');
  });

  if (!visible) return null;

  const accept = () => {
    localStorage.setItem('eh_cookie_consent', 'accepted');
    setVisible(false);
  };
  const decline = () => {
    localStorage.setItem('eh_cookie_consent', 'declined');
    setVisible(false);
  };

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9500,
      background: 'rgba(13,13,26,0.97)', backdropFilter: 'blur(12px)',
      borderTop: '1px solid rgba(201,168,76,0.2)',
      padding: '18px 24px',
      display: 'flex', flexWrap: 'wrap', alignItems: 'center',
      gap: '12px 24px',
    }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <p style={{ color: 'var(--text)', fontSize: '0.87rem', margin: 0, lineHeight: 1.6 }}>
          🍪 <strong style={{ color: 'var(--gold)' }}>We use cookies &amp; local storage</strong> to keep you signed in, remember your cart, and personalise your reading experience.
          By continuing to use Ellines Haven, you agree to our{' '}
          <a href="/privacy" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Privacy Policy</a>
          {' '}and{' '}
          <a href="/terms" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Terms of Service</a>.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        <button
          onClick={decline}
          style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--muted)', fontSize: '0.84rem', cursor: 'pointer' }}>
          Decline
        </button>
        <button
          onClick={accept}
          style={{ padding: '8px 22px', borderRadius: 6, border: 'none', background: 'var(--gold)', color: '#0d0d1a', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
          Accept All
        </button>
      </div>
    </div>
  );
}


/* ── Service Worker update poller ───────────────────────────────────────────
   Polls /version.json every 2 minutes. When a new build is detected it
   clears all caches and reloads — silently for most pages, skipped on /read/.
   This guarantees users always get fresh code within 2 minutes of a deploy,
   even if the SW update flow fails for any reason.
────────────────────────────────────────────────────────────────────────── */
function SWUpdateBanner() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocalhost) return;

    let currentVersion = null;

    const checkVersion = async () => {
      try {
        const res = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const latest = data?.v;
        if (!latest) return;

        if (!currentVersion) {
          // First load — remember what version we started on
          currentVersion = latest;
          return;
        }

        if (latest !== currentVersion) {
          // New deploy detected — don't interrupt readers
          const isReading = location.pathname.startsWith('/read');
          if (isReading) return;

          // Clear all caches then reload to serve the new version
          if ('caches' in window) {
            await caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {});
          }
          window.location.reload();
        }
      } catch {
        // Network error — ignore, will retry next interval
      }
    };

    // Check immediately, then every 2 minutes
    checkVersion();
    const timer = setInterval(checkVersion, 2 * 60 * 1000);
    // Also check when the tab comes back into focus
    const onVisible = () => { if (document.visibilityState === 'visible') checkVersion(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}

/* ── Maintenance gate ── */
function MaintenanceGate({ children }) {
  const { siteControls, user } = useApp();
  if (siteControls?.maintenanceMode && user?.role !== 'admin' && user?.role !== 'superadmin') {
    return (
      <main style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:40, textAlign:'center', background:'var(--bg)' }}>
        <div style={{ fontSize:'3.5rem' }}>🚧</div>
        <h2 style={{ color:'var(--gold)' }}>Under Maintenance</h2>
        <p style={{ color:'var(--muted)', maxWidth:380 }}>Ellines Haven is currently undergoing scheduled maintenance. We'll be back shortly.</p>
        <p style={{ fontSize:'0.82rem', color:'var(--muted)' }}>Contact: ellines.haven@gmail.com · WhatsApp: 0748 255 466</p>
      </main>
    );
  }
  return children;
}

/* ── Suspension gate ── */
function SuspensionGate({ children }) {
  const { user, isUserSuspended, logout } = useApp();
  if (user && isUserSuspended && isUserSuspended(user.email)) {
    return (
      <main style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:40, textAlign:'center', background:'var(--bg)' }}>
        <div style={{ fontSize:'3.5rem' }}>🚫</div>
        <h2 style={{ color:'#e74c3c' }}>Account Suspended</h2>
        <p style={{ color:'var(--muted)', maxWidth:380 }}>Your account has been suspended. Contact support to reinstate it.</p>
        <p style={{ fontSize:'0.82rem', color:'var(--muted)' }}>Contact support: ellines.haven@gmail.com</p>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Sign Out</button>
      </main>
    );
  }
  return children;
}

/* ── Watermark overlay ── */
function WatermarkOverlay() {
  const { siteControls, user } = useApp();
  if (!siteControls?.watermarkAll || !user) return null;
  const text = `${user.name} · ${user.email} · Ellines Haven`;
  return (
    <div aria-hidden="true" style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:9000, overflow:'hidden', opacity:0.07 }}>
      {Array.from({ length: 40 }).map((_, i) => (
        <span key={i} style={{
          position:'absolute',
          top:`${(i % 8) * 13}%`, left:`${Math.floor(i / 8) * 22}%`,
          transform:'rotate(-30deg)', fontSize:'0.72rem', fontWeight:700,
          color:'#fff', whiteSpace:'nowrap', letterSpacing:1, userSelect:'none',
        }}>{text}</span>
      ))}
    </div>
  );
}

/* ── Auto Refresh — admin-controlled, stored in siteControls ── */
function AutoRefresh() {
  const { siteControls, user } = useApp();
  const { pathname } = useLocation();

  useEffect(() => {
    const enabled  = siteControls?.autoRefreshEnabled;
    const interval = parseInt(siteControls?.autoRefreshInterval, 10) || 30;
    // Never auto-refresh for admins — they'd lose their place mid-edit
    const isAdmin  = user?.role === 'admin' || user?.role === 'superadmin';
    // Never auto-refresh while reading — it would kick readers out mid-chapter
    const isReading = pathname.startsWith('/read');
    if (!enabled || isAdmin || isReading) return;

    const ms = interval * 60 * 1000; // minutes → ms
    const timer = setTimeout(() => window.location.reload(), ms);
    return () => clearTimeout(timer);
  }, [siteControls?.autoRefreshEnabled, siteControls?.autoRefreshInterval, user?.role, pathname]);

  return null;
}

/* ── Root App ── */
export default function App() {
  // Initialize activity logger on app load
  useEffect(() => {
    initializeActivityLogger();
  }, []);

  return (
    <AppProvider>
      <LanguageProvider>
        <EditModeProvider>
          <BrowserRouter>
            <ScrollToTop />
            <VisitorQueueProcessor />
            <VisitorTracker />
            <ActivityTracker />
            <PresenceTracker />
            <PWAInstallPrompt />
            <AutoRefresh />
            <SiteControls />
            <WatermarkOverlay />
            <SWUpdateBanner />
            <CookieConsent />
            <WelcomePrompt />
            <EllineaAI />
            <EditToolbar />
            <MaintenanceGate>
              <SuspensionGate>
                <ChunkErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* Full-screen routes — no Navbar/Footer */}
                    <Route path="/read/:id" element={<Reader />} />
                    <Route path="/admin"    element={<PageErrorBoundary label="Admin Panel failed to load"><Admin /></PageErrorBoundary>} />

                    {/* Layout routes — with Navbar/Footer */}
                    <Route path="/*" element={
                      <Layout>
                        <Routes>
                          <Route path="/"              element={<Home />} />
                          <Route path="/library"       element={<Library />} />
                          <Route path="/book/:id"      element={<BookDetail />} />
                          <Route path="/cart"          element={<Cart />} />
                          <Route path="/login"         element={<Login />} />
                          <Route path="/register"      element={<Register />} />
                          <Route path="/my-library"    element={<PageErrorBoundary label="My Library failed to load"><MyLibrary /></PageErrorBoundary>} />
                          <Route path="/about"         element={<About />} />
                          <Route path="/founder"       element={<Founder />} />
                          <Route path="/contact"       element={<Contact />} />
                          <Route path="/profile"       element={<PageErrorBoundary label="Profile failed to load"><UserProfile /></PageErrorBoundary>} />
                          <Route path="/reader/:email" element={<PageErrorBoundary label="Reader Profile failed to load"><ReaderProfile /></PageErrorBoundary>} />
                          <Route path="/admin-profile" element={<PageErrorBoundary label="Admin Profile failed to load"><AdminProfile /></PageErrorBoundary>} />
                          <Route path="/recommendations" element={<PageErrorBoundary label="Recommendations failed to load"><Recommendations /></PageErrorBoundary>} />
                          <Route path="/challenges"    element={<PageErrorBoundary label="Challenges failed to load"><Challenges /></PageErrorBoundary>} />
                          <Route path="/faq"           element={<FAQ />} />
                          <Route path="/terms"         element={<Terms />} />
                          <Route path="/privacy"       element={<Privacy />} />
                          <Route path="/wishlist"         element={<Wishlist />} />
                          <Route path="/change-password" element={<ChangePassword />} />
                          {/* Catch-all: try custom pages first, then 404 */}
                          <Route path="*" element={<CustomPageRenderer />} />
                        </Routes>
                      </Layout>
                    } />
                  </Routes>
                </Suspense>
                </ChunkErrorBoundary>
              </SuspensionGate>
            </MaintenanceGate>
          </BrowserRouter>
        </EditModeProvider>
      </LanguageProvider>
    </AppProvider>
  );
}

/* ── 404 Not Found ── */
function NotFound() {
  return (
    <div className="notfound-page">
      <div className="notfound-glow notfound-glow--a" />
      <div className="notfound-glow notfound-glow--b" />
      <div className="notfound-inner">
        <img src="/pwa-icon-192.png" alt="Ellines Haven" className="notfound-logo" />
        <div className="notfound-number" aria-hidden="true">404</div>
        <h1 className="notfound-title">Page Not Found</h1>
        <p className="notfound-sub">
          The page you're looking for doesn't exist — or it may have moved. Let's get you back to the stories.
        </p>
        <div className="notfound-links">
          <a href="/" className="btn btn-primary">Go Home</a>
          <a href="/library" className="btn btn-outline">Browse Books</a>
          <a href="/contact" className="btn btn-ghost">Contact Us</a>
        </div>
        <div className="notfound-quote">
          <span>"Every wrong turn is still part of the journey."</span>
        </div>
      </div>
    </div>
  );
}
