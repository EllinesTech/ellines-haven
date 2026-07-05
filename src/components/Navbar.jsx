import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import LanguageSwitcher from './LanguageSwitcher';
import UserNotificationsBell from './UserNotifications';
import AdminNotificationsBell from './AdminNotificationsBell';
import './Navbar.css';

const isAdmin = (role) => role === 'admin' || role === 'superadmin';

/* ── Cart icon ── */
function CartIcon({ count }) {
  return (
    <Link to="/cart" className="nav__cart" aria-label={`Cart (${count} items)`} title="Cart">
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.4 7h12.8M17 20a1 1 0 100-2 1 1 0 000 2zm-10 0a1 1 0 100-2 1 1 0 000 2z"/>
      </svg>
      {count > 0 && <span className="nav__cart-badge">{count}</span>}
    </Link>
  );
}

/* ── Wishlist bookmark icon — desktop only (in drawer on mobile) ── */
function WishlistIcon({ count }) {
  const { user } = useApp();
  if (!user) return null;
  return (
    <Link
      to="/wishlist"
      className="nav__cart nav__hide-mobile"
      aria-label={`Wishlist (${count} books)`}
      title="My Wishlist"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
      </svg>
      {count > 0 && <span className="nav__cart-badge" style={{ background: 'var(--gold)' }}>{count}</span>}
    </Link>
  );
}

export default function Navbar() {
  const { user, cart, wishlist, logout } = useApp();
  const [scrolled, setScrolled]   = useState(false);
  const [open,     setOpen]       = useState(false);   // mobile drawer
  const [dropdown, setDropdown]   = useState(false);   // avatar dropdown
  const dropRef                   = useRef(null);
  const navigate                  = useNavigate();

  /* ── Scroll listener ── */
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  /* ── Close dropdown on outside click ── */
  useEffect(() => {
    const handler = e => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Close mobile drawer on resize to desktop ── */
  useEffect(() => {
    const fn = () => { if (window.innerWidth > 768) setOpen(false); };
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const doLogout = () => {
    logout();
    setDropdown(false);
    setOpen(false);
    navigate('/');
  };

  const closeAll = () => { setOpen(false); setDropdown(false); };
  const adminLabel = user?.role === 'superadmin' ? 'Super Admin Panel' : 'Admin Panel';
  const roleLabel  = user?.role === 'superadmin' ? 'Super Admin'
                   : user?.role === 'admin'       ? 'Admin'
                   : 'Member';

  return (
    <nav className={`nav${scrolled ? ' nav--solid' : ''}`}>
      <div className="nav__inner container">

        {/* ── Brand ── */}
        <Link to="/" className="nav__brand" onClick={closeAll}>
          <img src="/logo-nobg3.png" alt="Ellines Haven" className="nav__logo-img" />
          <div className="nav__brand-text">
            <span className="nav__brand-name">Ellines Haven</span>
            <span className="nav__brand-tagline">Home For The Story Soul</span>
          </div>
        </Link>

        {/* ── Desktop links ── */}
        <ul className="nav__links">
          <li><NavLink to="/">Home</NavLink></li>
          <li><NavLink to="/library">Browse</NavLink></li>
          <li><NavLink to="/about">About</NavLink></li>
          <li><NavLink to="/founder">Founder</NavLink></li>
          <li><NavLink to="/contact">Contact</NavLink></li>
          <li><NavLink to="/faq">FAQ</NavLink></li>
        </ul>

        {/* ── Right-side actions ── */}
        <div className="nav__actions">

          {/* Language switcher — hidden on mobile, appears in drawer */}
          <span className="nav__hide-mobile">
            <LanguageSwitcher />
          </span>

          {/* Cart — always visible */}
          <CartIcon count={cart.length} />

          {user ? (
            <>
              {/* Wishlist — hidden on mobile (in drawer) */}
              <WishlistIcon count={wishlist.length} />

              {/* Admin bell — hidden on mobile (in drawer) */}
              {isAdmin(user.role) && (
                <span className="nav__hide-mobile">
                  <AdminNotificationsBell user={user} />
                </span>
              )}

              {/* User bell — hidden on mobile (in drawer) */}
              <span className="nav__hide-mobile">
                <UserNotificationsBell user={user} />
              </span>

              {/* Avatar dropdown — always visible (compact on mobile) */}
              <div className="nav__user" ref={dropRef}>
                <button
                  className="nav__avatar-btn"
                  onClick={() => setDropdown(d => !d)}
                  aria-label="Account menu"
                >
                  <div className={`nav__avatar${user.role === 'superadmin' ? ' nav__avatar--super' : ''}`}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  {/* These are hidden on mobile via CSS */}
                  <span className="nav__avatar-btn-label">{user.name.split(' ')[0]}</span>
                  {user.role === 'superadmin' && <span className="nav__super-badge">SA</span>}
                  <svg className="nav__avatar-btn-label" width="12" height="12" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>

                {/* Dropdown */}
                {dropdown && (
                  <div className="nav__dropdown">
                    {/* User info header */}
                    <div style={{
                      padding: '12px 18px 10px',
                      borderBottom: '1px solid rgba(255,255,255,0.07)',
                      pointerEvents: 'none',
                    }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)' }}>
                        {user.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginTop: 2 }}>
                        {roleLabel}
                      </div>
                    </div>

                    {isAdmin(user.role)
                      ? <Link to="/admin-profile" onClick={closeAll}>⚡ Admin Profile</Link>
                      : <Link to="/profile"       onClick={closeAll}>👤 My Profile</Link>
                    }
                    {!isAdmin(user.role) && (
                      <Link to="/my-library" onClick={closeAll}>📚 My Library</Link>
                    )}
                    {!isAdmin(user.role) && (
                      <Link to="/wishlist" onClick={closeAll}>🔖 My Wishlist</Link>
                    )}
                    {isAdmin(user.role) && (
                      <Link to="/admin" onClick={closeAll} className="nav__dropdown-admin">
                        🛡️ {adminLabel}
                      </Link>
                    )}
                    {/* Logout — always last, prominent */}
                    <button onClick={doLogout} className="nav__dropdown-logout">
                      🚪 Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Desktop auth buttons */
            <div className="nav__auth">
              <Link to="/login"    className="btn btn-ghost btn-sm">Sign In</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Join Free</Link>
            </div>
          )}

          {/* Burger — mobile only */}
          <button
            className={`nav__burger${open ? ' open' : ''}`}
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <span/><span/><span/>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════
          MOBILE DRAWER
      ══════════════════════════════════════ */}
      {open && (
        <div className="nav__mobile">

          {/* User card when logged in */}
          {user && (
            <>
              <div className="nav__mobile-user-info">
                <div className={`nav__mobile-user-avatar${user.role === 'superadmin' ? ' nav__avatar--super' : ''}`}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="nav__mobile-user-name">{user.name}</div>
                  <div className="nav__mobile-user-role">{roleLabel}</div>
                </div>
              </div>
              <div className="nav__mobile-divider" />
            </>
          )}

          {/* Main nav links */}
          {[
            ['/',        '🏠 Home'],
            ['/library', '📚 Browse Books'],
            ['/about',   '✨ About'],
            ['/founder', '👤 The Founder'],
            ['/contact', '📬 Contact'],
            ['/faq',     '❓ FAQ'],
            ['/cart',    `🛒 Cart${cart.length > 0 ? ` (${cart.length})` : ''}`],
          ].map(([to, label]) => (
            <NavLink key={to} to={to} onClick={closeAll}>{label}</NavLink>
          ))}

          <div className="nav__mobile-divider" />

          {user ? (
            <>
              {/* Account links */}
              {isAdmin(user.role)
                ? <NavLink to="/admin-profile" onClick={closeAll}>⚡ Admin Profile</NavLink>
                : <NavLink to="/profile"       onClick={closeAll}>👤 My Profile</NavLink>
              }
              {!isAdmin(user.role) && (
                <NavLink to="/my-library" onClick={closeAll}>
                  📖 My Library
                </NavLink>
              )}
              {!isAdmin(user.role) && (
                <NavLink to="/wishlist" onClick={closeAll}>
                  🔖 Wishlist{wishlist.length > 0 ? ` (${wishlist.length})` : ''}
                </NavLink>
              )}
              {isAdmin(user.role) && (
                <NavLink to="/admin" onClick={closeAll}>
                  🛡️ {adminLabel}
                </NavLink>
              )}

              <div className="nav__mobile-divider" />

              {/* Language — only in drawer on mobile */}
              <div style={{ padding: '8px 14px' }}>
                <LanguageSwitcher />
              </div>

              <div className="nav__mobile-divider" />

              {/* Sign out — prominent */}
              <button onClick={doLogout} className="nav__mobile-signout">
                🚪 Sign Out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login"    onClick={closeAll}>🔑 Sign In</NavLink>
              <NavLink to="/register" onClick={closeAll}>✨ Create Account</NavLink>
              <div style={{ padding: '8px 14px' }}>
                <LanguageSwitcher />
              </div>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
