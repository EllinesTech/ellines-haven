import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function WelcomePrompt() {
  const { user } = useApp();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (user) return;
    const dismissed = sessionStorage.getItem('eh_welcome_dismissed');
    if (dismissed) return;
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, [user]);

  if (!visible || user) return null;

  const dismiss = () => {
    sessionStorage.setItem('eh_welcome_dismissed', '1');
    setVisible(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', animation: 'fadeIn 0.3s ease',
    }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 16, maxWidth: 440, width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        overflow: 'hidden', position: 'relative',
      }}>
        {/* Gold accent top bar */}
        <div style={{ height: 4, background: 'var(--grad-gold)' }} />

        <div style={{ padding: '32px 28px 28px' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <img
              src="/logo-nobg3.png"
              alt="Ellines Haven"
              style={{ height: 80, margin: '0 auto', filter: 'drop-shadow(0 2px 12px rgba(201,168,76,0.4))' }}
            />
          </div>

          <h2 style={{ textAlign: 'center', fontSize: '1.4rem', marginBottom: 8 }}>
            Welcome to <span style={{ color: 'var(--gold)' }}>Ellines Haven</span>
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.88rem', marginBottom: 28, lineHeight: 1.6 }}>
            Home for the story soul. Discover compelling African novels and short stories by Elijah Mwangi M.
          </p>

          {/* Create Account */}
          <Link to="/register" onClick={dismiss} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%', padding: '12px', borderRadius: 10,
            background: '#fff', color: '#333', fontWeight: 700, fontSize: '0.92rem',
            textDecoration: 'none', marginBottom: 10, transition: 'all 0.2s',
            border: '1px solid rgba(0,0,0,0.15)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            Create Free Account
          </Link>

          {/* Sign In */}
          <Link to="/login" onClick={dismiss} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', padding: '12px', borderRadius: 10,
            background: 'var(--grad-gold)', color: 'var(--on-gold)',
            fontWeight: 700, fontSize: '0.92rem', textDecoration: 'none',
            marginBottom: 10, transition: 'all 0.2s',
          }}>
            Sign In to My Account
          </Link>

          {/* Browse as Guest */}
          <button onClick={dismiss} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', padding: '11px', borderRadius: 10,
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--dim)',
            color: 'var(--muted)', fontWeight: 500, fontSize: '0.88rem',
            cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
          }}>
            Continue Browsing as Guest
          </button>

          <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--muted)', marginTop: 16, lineHeight: 1.5 }}>
            Free to browse · Purchase unlocks reading &amp; download · 100% original African stories
          </p>
        </div>

        {/* Close button */}
        <button onClick={dismiss} aria-label="Close" style={{
          position: 'absolute', top: 12, right: 14,
          background: 'none', border: 'none', color: 'var(--muted)',
          fontSize: '1.1rem', cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
        }}>✕</button>
      </div>

      <style>{`@keyframes fadeIn { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }`}</style>
    </div>
  );
}
