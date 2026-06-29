import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function WelcomePrompt() {
  const { user } = useApp();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if not logged in AND not dismissed in this session
    if (user) return;
    const dismissed = sessionStorage.getItem('eh_welcome_dismissed');
    if (dismissed) return;
    // Small delay so page loads first
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
            <img src="/logo-nobg3.png" alt="Ellines Haven" style={{ height: 80, margin: '0 auto', filter: 'drop-shadow(0 2px 12px rgba(201,168,76,0.4))' }} />
          </div>

          <h2 style={{ textAlign: 'center', fontSize: '1.4rem', marginBottom: 8 }}>
            Welcome to <span style={{ color: 'var(--gold)' }}>Ellines Haven</span>
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.88rem', marginBottom: 28, lineHeight: 1.6 }}>
            Home for the story soul. Discover compelling African novels and short stories by Elijah Mwangi M.
          </p>

          {/* Sign up with Google */}
          <Link to="/register" onClick={dismiss} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%', padding: '12px', borderRadius: 10,
            background: '#fff', color: '#333', fontWeight: 600, fontSize: '0.92rem',
            textDecoration: 'none', marginBottom: 10, transition: 'all 0.2s',
            border: '1px solid rgba(0,0,0,0.15)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign up with Google email
          </Link>

          <Link to="/login" onClick={dismiss} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', padding: '12px', borderRadius: 10,
            background: 'var(--grad-gold)', color: 'var(--on-gold)',
            fontWeight: 600, fontSize: '0.92rem', textDecoration: 'none',
            marginBottom: 10, transition: 'all 0.2s',
          }}>
            Sign In to My Account
          </Link>

          <button onClick={dismiss} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', padding: '11px', borderRadius: 10,
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--dim)',
            color: 'var(--muted)', fontWeight: 500, fontSize: '0.88rem',
            cursor: 'pointer', transition: 'all 0.2s',
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
