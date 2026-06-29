import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LanguageProvider } from './context/LanguageContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import WelcomePrompt from './components/WelcomePrompt';
import EllineaAI from './components/EllineaAI';
import './App.css';

const Home        = lazy(() => import('./pages/Home'));
const Library     = lazy(() => import('./pages/Library'));
const BookDetail  = lazy(() => import('./pages/BookDetail'));
const Cart        = lazy(() => import('./pages/Cart'));
const Login       = lazy(() => import('./pages/Login'));
const Register    = lazy(() => import('./pages/Register'));
const MyLibrary   = lazy(() => import('./pages/MyLibrary'));
const Reader      = lazy(() => import('./pages/Reader'));
const About       = lazy(() => import('./pages/About'));
const Contact     = lazy(() => import('./pages/Contact'));
const Admin       = lazy(() => import('./pages/Admin'));
const Founder     = lazy(() => import('./pages/Founder'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const AdminProfile = lazy(() => import('./pages/AdminProfile'));
const FAQ         = lazy(() => import('./pages/FAQ'));
const Terms       = lazy(() => import('./pages/Terms'));
const Privacy     = lazy(() => import('./pages/Privacy'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
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

/* ── Global site controls: right-click, DevTools, copy blocking ── */
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

  // Print block via CSS
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

/* ── Floating WhatsApp button — visible on all pages ── */
function WhatsAppFloat() {
  const { user } = useApp();
  return (
    <a href="https://wa.me/254748255466" target="_blank" rel="noopener noreferrer"
      title="Chat with us on WhatsApp"
      style={{
        position:'fixed', bottom:24, right:24, zIndex:8000,
        width:56, height:56, borderRadius:'50%',
        background:'#25D366', color:'#fff',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:'0 4px 20px rgba(37,211,102,0.45)',
        textDecoration:'none', transition:'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform='scale(1.12)'; e.currentTarget.style.boxShadow='0 6px 28px rgba(37,211,102,0.6)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.boxShadow='0 4px 20px rgba(37,211,102,0.45)'; }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    </a>
  );
}
function MaintenanceGate({ children }) {
  const { siteControls, user } = useApp();
  if (siteControls?.maintenanceMode && user?.role !== 'admin' && user?.role !== 'superadmin') {
    return (
      <main style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:40, textAlign:'center', background:'var(--bg)' }}>
        <div style={{ fontSize:'3.5rem' }}>🚧</div>
        <h2 style={{ color:'var(--gold)' }}>Under Maintenance</h2>
        <p style={{ color:'var(--muted)', maxWidth:380 }}>
          Ellines Haven is currently undergoing scheduled maintenance. We'll be back shortly.
        </p>
        <p style={{ fontSize:'0.82rem', color:'var(--muted)' }}>Contact: ellines.haven@gmail.com · WhatsApp: 0748 255 466</p>
      </main>
    );
  }
  return children;
}

/* ── Suspension gate — shown instantly when admin suspends a logged-in user ── */
function SuspensionGate({ children }) {
  const { user, isUserSuspended, logout } = useApp();
  if (user && isUserSuspended && isUserSuspended(user.email)) {
    return (
      <main style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:40, textAlign:'center', background:'var(--bg)' }}>
        <div style={{ fontSize:'3.5rem' }}>🚫</div>
        <h2 style={{ color:'#e74c3c' }}>Account Suspended</h2>
        <p style={{ color:'var(--muted)', maxWidth:380 }}>
          Your account has been suspended by the administrator. You cannot access any content until your account is reinstated.
        </p>
        <p style={{ fontSize:'0.82rem', color:'var(--muted)' }}>Contact support: ellines.haven@gmail.com</p>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Sign Out</button>
      </main>
    );
  }
  return children;
}

/* ── Global watermark overlay when admin enables watermarkAll ── */
function WatermarkOverlay() {
  const { siteControls, user } = useApp();
  if (!siteControls?.watermarkAll || !user) return null;
  const text = `${user.name} · ${user.email} · Ellines Haven`;
  return (
    <div aria-hidden="true" style={{
      position:'fixed', inset:0, pointerEvents:'none', zIndex:9000,
      overflow:'hidden', opacity:0.07,
    }}>
      {Array.from({ length: 40 }).map((_, i) => (
        <span key={i} style={{
          position:'absolute',
          top: `${(i % 8) * 13}%`,
          left: `${Math.floor(i / 8) * 22}%`,
          transform:'rotate(-30deg)',
          fontSize:'0.72rem', fontWeight:700,
          color:'#fff', whiteSpace:'nowrap',
          letterSpacing:1, userSelect:'none',
        }}>{text}</span>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <LanguageProvider>
        <BrowserRouter>
          <ScrollToTop />
          <SiteControls />
          <WatermarkOverlay />
          <WhatsAppFloat />
          <WelcomePrompt />
          <EllineaAI />
          <MaintenanceGate>
          <SuspensionGate>
            <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
              <Routes>
                <Route path="/read/:id" element={<Reader />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/*" element={
                  <Layout>
                    <Routes>
                      <Route path="/"           element={<Home />} />
                      <Route path="/library"    element={<Library />} />
                      <Route path="/book/:id"   element={<BookDetail />} />
                      <Route path="/cart"       element={<Cart />} />
                      <Route path="/login"      element={<Login />} />
                      <Route path="/register"   element={<Register />} />
                      <Route path="/my-library" element={<MyLibrary />} />
                      <Route path="/about"      element={<About />} />
                      <Route path="/founder"    element={<Founder />} />
                      <Route path="/contact"    element={<Contact />} />
                      <Route path="/profile"       element={<UserProfile />} />
                      <Route path="/admin-profile" element={<AdminProfile />} />
                      <Route path="/faq"        element={<FAQ />} />
                      <Route path="/terms"      element={<Terms />} />
                      <Route path="/privacy"    element={<Privacy />} />
                      <Route path="*"           element={<NotFound />} />
                    </Routes>
                  </Layout>
                } />
              </Routes>
            </Suspense>
          </SuspensionGate>
          </MaintenanceGate>
        </BrowserRouter>
      </LanguageProvider>
    </AppProvider>
  );
}

function NotFound() {
  return (
    <div className="notfound-page">
      <div className="notfound-glow notfound-glow--a" />
      <div className="notfound-glow notfound-glow--b" />

      <div className="notfound-inner">
        {/* Logo */}
        <img src="/logo-icon.png" alt="Ellines Haven" className="notfound-logo" />

        {/* 404 number */}
        <div className="notfound-number" aria-hidden="true">404</div>

        <h1 className="notfound-title">Page Not Found</h1>
        <p className="notfound-sub">
          The page you're looking for doesn't exist — or it may have moved.
          Let's get you back to the stories.
        </p>

        {/* Quick links */}
        <div className="notfound-links">
          <a href="/" className="btn btn-primary">Go Home</a>
          <a href="/library" className="btn btn-outline">Browse Books</a>
          <a href="/contact" className="btn btn-ghost">Contact Us</a>
        </div>

        {/* Decorative quote */}
        <div className="notfound-quote">
          <span>"Every wrong turn is still part of the journey."</span>
        </div>
      </div>
    </div>
  );
}
