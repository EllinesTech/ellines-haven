import { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import LanguageSwitcher from './LanguageSwitcher';
import './Navbar.css';

const isAdmin = (role) => role === 'admin' || role === 'superadmin';

export default function Navbar() {
  const { user, cart, logout } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [dropdown, setDropdown] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const doLogout = () => { logout(); setDropdown(false); navigate('/'); };
  const adminLabel = user?.role === 'superadmin' ? 'Super Admin Panel' : 'Admin Panel';

  return (
    <nav className={`nav${scrolled ? ' nav--solid' : ''}`}>
      <div className="nav__inner container">

        {/* Brand */}
        <Link to="/" className="nav__brand" onClick={() => setOpen(false)}>
          <img src="/logo-nobg3.png" alt="Ellines Haven" className="nav__logo-img" />
          <div className="nav__brand-text">
            <span className="nav__brand-name">Ellines Haven</span>
            <span className="nav__brand-tagline">Home For The Story Soul</span>
          </div>
        </Link>

        {/* Desktop links */}
        <ul className="nav__links">
          <li><NavLink to="/">Home</NavLink></li>
          <li><NavLink to="/library">Browse</NavLink></li>
          <li><NavLink to="/about">About</NavLink></li>
          <li><NavLink to="/founder">Founder</NavLink></li>
          <li><NavLink to="/contact">Contact</NavLink></li>
          <li><NavLink to="/faq">FAQ</NavLink></li>
        </ul>

        {/* Right actions */}
        <div className="nav__actions">
          <LanguageSwitcher />
          <Link to="/cart" className="nav__cart" aria-label="Cart">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.4 7h12.8M17 20a1 1 0 100-2 1 1 0 000 2zm-10 0a1 1 0 100-2 1 1 0 000 2z"/>
            </svg>
            {cart.length > 0 && <span className="nav__cart-badge">{cart.length}</span>}
          </Link>

          {user ? (
            <div className="nav__user">
              <button className="nav__avatar-btn" onClick={() => setDropdown(d => !d)}>
                <div className={`nav__avatar${user.role === 'superadmin' ? ' nav__avatar--super' : ''}`}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span>{user.name.split(' ')[0]}</span>
                {user.role === 'superadmin' && <span className="nav__super-badge">SA</span>}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              {dropdown && (
                <div className="nav__dropdown">
                  {isAdmin(user.role)
                    ? <Link to="/admin-profile" onClick={() => setDropdown(false)}>⚡ Admin Profile</Link>
                    : <Link to="/profile" onClick={() => setDropdown(false)}>👤 My Profile</Link>
                  }
                  {!isAdmin(user.role) && <Link to="/my-library" onClick={() => setDropdown(false)}>📚 My Library</Link>}
                  {isAdmin(user.role) && (
                    <Link to="/admin" onClick={() => setDropdown(false)} className="nav__dropdown-admin">
                      {adminLabel}
                    </Link>
                  )}
                  <button onClick={doLogout}>Sign Out</button>
                </div>
              )}
            </div>
          ) : (
            <div className="nav__auth">
              <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Join Free</Link>
            </div>
          )}

          <button className={`nav__burger${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)} aria-label="Menu">
            <span/><span/><span/>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="nav__mobile">
          {[['/', 'Home'], ['/library', 'Browse'], ['/about', 'About'], ['/founder', 'Founder'], ['/contact', 'Contact'], ['/faq', 'FAQ'], ['/cart', `Cart (${cart.length})`]].map(([to, label]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}>{label}</NavLink>
          ))}
          <div className="nav__mobile-divider"/>
          {user ? (
            <>
              {isAdmin(user.role)
                ? <NavLink to="/admin-profile" onClick={() => setOpen(false)}>⚡ Admin Profile</NavLink>
                : <NavLink to="/profile" onClick={() => setOpen(false)}>👤 My Profile</NavLink>
              }
              {!isAdmin(user.role) && <NavLink to="/my-library" onClick={() => setOpen(false)}>My Library</NavLink>}
              {isAdmin(user.role) && <NavLink to="/admin" onClick={() => setOpen(false)}>{adminLabel}</NavLink>}
              <button onClick={() => { doLogout(); setOpen(false); }}>Sign Out</button>
            </>
          ) : (
            <>
              <NavLink to="/login" onClick={() => setOpen(false)}>Sign In</NavLink>
              <NavLink to="/register" onClick={() => setOpen(false)}>Create Account</NavLink>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
