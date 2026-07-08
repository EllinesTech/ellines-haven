import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { findUserInFirestore } from './Login';
import './Auth.css';

function EyeIcon({ open }) {
  return open
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
}

export default function ChangePassword() {
  const { user, setUser, logout } = useApp();
  const navigate = useNavigate();

  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [showPw,     setShowPw]     = useState(false);
  const [showConfirm,setShowConfirm]= useState(false);
  const [err,        setErr]        = useState('');
  const [busy,       setBusy]       = useState(false);
  const [done,       setDone]       = useState(false);

  // Redirect non-logged-in visitors away
  if (!user) {
    return (
      <main className="auth-page">
        <div className="auth-wrap">
          <div className="auth-card card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', marginBottom: 20 }}>You need to be logged in to change your password.</p>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block' }}>Sign In</Link>
          </div>
        </div>
      </main>
    );
  }

  const handleSubmit = async e => {
    e.preventDefault();
    setErr('');

    if (newPw.length < 6) {
      setErr('Password must be at least 6 characters.'); return;
    }
    if (newPw !== confirmPw) {
      setErr('Passwords do not match.'); return;
    }

    setBusy(true);
    try {
      const emailKey = user.email.toLowerCase();

      // 1. Update Firestore users collection — clear mustChangePassword flag
      const fsUser = await findUserInFirestore(emailKey);
      if (fsUser) {
        await setDoc(doc(db, 'users', fsUser.id), {
          passwordHash: newPw,
          mustChangePassword: false,
          passwordResetBy: null,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      // 2. Update localStorage pw_overrides for cross-device compat
      const overrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
      overrides[emailKey] = newPw;
      localStorage.setItem('eh_pw_overrides', JSON.stringify(overrides));

      // 3. Also clear flag in registered_users legacy doc if present
      try {
        const { doc: firestoreDoc, setDoc: firestoreSetDoc, getDoc, serverTimestamp: sTs } = await import('firebase/firestore');
        const { db: firestoreDb } = await import('../firebase');
        const regSnap = await getDoc(firestoreDoc(firestoreDb, 'site_data', 'registered_users'));
        if (regSnap.exists()) {
          const pwOv = regSnap.data().pwOverrides || {};
          pwOv[emailKey] = newPw;
          await firestoreSetDoc(firestoreDoc(firestoreDb, 'site_data', 'registered_users'), {
            pwOverrides: pwOv, updatedAt: sTs(),
          }, { merge: true });
        }
      } catch {}

      // 4. Update the session user object — remove the mustChangePassword flag
      const updatedUser = { ...user, mustChangePassword: false };
      setUser(updatedUser);

      setDone(true);
      // Redirect to home after a short delay
      setTimeout(() => navigate('/', { replace: true }), 2000);
    } catch (e) {
      setErr('Something went wrong. Please try again.');
      console.error('[ChangePassword]', e);
    }
    setBusy(false);
  };

  if (done) {
    return (
      <main className="auth-page">
        <div className="auth-wrap">
          <div className="auth-card card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
            <h2 style={{ color: 'var(--gold)', marginBottom: 8 }}>Password Updated</h2>
            <p style={{ color: 'var(--muted)' }}>Your new password has been saved. Taking you to Ellines Haven…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-wrap">
        <div className="auth-card card">
          <div className="auth-top">
            <Link to="/"><img src="/logo-nobg3.png" alt="Ellines Haven" className="auth-logo-img" /></Link>
            <h2>Set New Password</h2>
            <p style={{ color: 'var(--muted)' }}>
              Your password was reset by an admin. Please choose a new password to continue.
            </p>
          </div>

          {/* Security notice */}
          <div style={{
            background: 'rgba(201,168,76,0.1)',
            border: '1px solid rgba(201,168,76,0.35)',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: '0.84rem',
            color: 'var(--text)',
          }}>
            <strong style={{ color: 'var(--gold)' }}>🔒 Action Required</strong>
            <br />
            For your security, you must set a new password before accessing your account.
          </div>

          <form onSubmit={handleSubmit}>
            {err && (
              <div className="form-error auth-alert" role="alert" style={{ marginBottom: 16 }}>
                <span className="auth-alert-icon">⚠️</span> {err}
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>New Password</label>
              <div className="auth-pw-wrap">
                <input
                  className="field"
                  type={showPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  autoFocus
                />
                <button type="button" className="auth-pw-eye" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide' : 'Show'}>
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 24 }}>
              <label>Confirm New Password</label>
              <div className="auth-pw-wrap">
                <input
                  className="field"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Repeat new password"
                  required
                />
                <button type="button" className="auth-pw-eye" onClick={() => setShowConfirm(v => !v)} aria-label={showConfirm ? 'Hide' : 'Show'}>
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? '⏳ Saving…' : '🔐 Set New Password'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              type="button"
              onClick={() => { logout(); navigate('/login', { replace: true }); }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Sign out instead
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
