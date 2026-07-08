import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense, Component } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LanguageProvider } from './context/LanguageContext';
import { EditModeProvider, useEditMode } from './context/EditModeContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import WelcomePrompt from './components/WelcomePrompt';
import EllineaAI from './components/EllineaAI';
import EditToolbar from './components/EditToolbar';
import { initializeActivityLogger } from './utils/reliableActivityLogger';

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import './App.css';

/* ── Chunk error boundary — auto-reloads on stale deploy cache ── */
class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err) {
    const isChunkError =
      err?.name === 'ChunkLoadError' ||
      (err?.message || '').includes('Failed to fetch dynamically imported module') ||
      (err?.message || '').includes('Importing a module script failed') ||
      (err?.message || '').includes('error loading dynamically imported module');
    if (isChunkError) {
      // Reload once to pick up fresh chunks — guard against reload loops
      const reloadKey = 'eh_chunk_reload';
      const last = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        window.location.reload();
      }
    }
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          padding: 40, textAlign: 'center', background: 'var(--bg, #0d0d1a)',
        }}>
          <div style={{ fontSize: '2.5rem' }}>⚡</div>
          <h2 style={{ color: '#c9a84c', margin: 0 }}>Update Available</h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 340, margin: 0 }}>
            A new version of Ellines Haven is available. Refreshing to load the latest…
          </p>
          <button
            style={{
              marginTop: 8, padding: '10px 28px', background: '#c9a84c',
              color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer',
              fontWeight: 700, fontSize: '0.9rem',
            }}
            onClick={() => { sessionStorage.removeItem('eh_chunk_reload'); window.location.reload(); }}
          >
            Refresh Now
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
      <img src="/logo-icon.png" alt="Ellines Haven" style={{ height: 56, opacity: 0.9, animation: 'eh-pulse 1.4s ease-in-out infinite' }} />
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

/* ── Scroll to top on route change ── */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/* ── Visitor Tracker — server-side real IP via Cloud Function (callable) ── */
const VISITOR_SESSION_KEY = 'eh_visitor_logged';

function VisitorTracker() {
  const { pathname } = useLocation();
  const { user } = useApp();

  useEffect(() => {
    // Skip admin and reader pages — don't track admin browsing as site visitors
    if (pathname.startsWith('/admin') || pathname.startsWith('/read')) return;

    // One anonymous visit per browser session (prevents double-counting SPA navigation)
    // But if a user logs in mid-session, re-track once to attach their info
    const alreadyTracked = sessionStorage.getItem(VISITOR_SESSION_KEY);
    const trackedEmail   = sessionStorage.getItem(VISITOR_SESSION_KEY + '_user') || '';
    const currentEmail   = user?.email || '';

    // Skip if: already tracked as this user (or already tracked anonymously with no user)
    if (alreadyTracked && trackedEmail === currentEmail) return;

    sessionStorage.setItem(VISITOR_SESSION_KEY, '1');
    sessionStorage.setItem(VISITOR_SESSION_KEY + '_user', currentEmail);

    (async () => {
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const fns = getFunctions(undefined, 'us-central1');
        const trackFn = httpsCallable(fns, 'trackVisitor');

        const ua = navigator.userAgent || '';
        let device = 'Desktop';
        if (/Mobi|Android|iPhone|iPad/i.test(ua)) device = 'Mobile';
        else if (/Tablet|iPad/i.test(ua)) device = 'Tablet';
        const referrer = document.referrer
          ? (() => { try { return new URL(document.referrer).hostname; } catch { return document.referrer.slice(0, 100); } })()
          : 'direct';

        await trackFn({
          page: pathname,
          referrer,
          userAgent: ua.slice(0, 300),
          device,
          userEmail: user?.email || null,
          userName:  user?.name  || null,
        });
      } catch { /* silent — never block the page */ }
    })();
  }, [pathname, user?.email]); // re-run when route or logged-in user changes

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
      <div style={{ paddingTop: 0 }}>{children}</div>
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


/* ── Service Worker — auto-reload on update (no banner needed) ──────────────
   The SW registration in index.html handles this automatically.
   When a new SW activates, controllerchange fires → page reloads.
────────────────────────────────────────────────────────────────────────── */
function SWUpdateBanner() {
  // Kept as a no-op — auto-reload is handled in index.html SW registration
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

  useEffect(() => {
    const enabled  = siteControls?.autoRefreshEnabled;
    const interval = parseInt(siteControls?.autoRefreshInterval, 10) || 30;
    // Never auto-refresh for admins — they'd lose their place mid-edit
    const isAdmin  = user?.role === 'admin' || user?.role === 'superadmin';
    if (!enabled || isAdmin) return;

    const ms = interval * 60 * 1000; // minutes → ms
    const timer = setTimeout(() => window.location.reload(), ms);
    return () => clearTimeout(timer);
  }, [siteControls?.autoRefreshEnabled, siteControls?.autoRefreshInterval, user?.role]);

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
            <VisitorTracker />
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
                    <Route path="/admin"    element={<Admin />} />

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
                          <Route path="/my-library"    element={<MyLibrary />} />
                          <Route path="/about"         element={<About />} />
                          <Route path="/founder"       element={<Founder />} />
                          <Route path="/contact"       element={<Contact />} />
                          <Route path="/profile"       element={<UserProfile />} />
                          <Route path="/admin-profile" element={<AdminProfile />} />
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
        <img src="/logo-icon.png" alt="Ellines Haven" className="notfound-logo" />
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
