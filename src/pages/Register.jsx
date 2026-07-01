import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import './Auth.css';

function EyeIcon({ open }) {
  return open
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
}

export default function Register() {
  const { setUser, siteControls } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name:'', email:'', password:'', confirm:'' });
  const [show, setShow] = useState({ password:false, confirm:false });
  const [err,  setErr]  = useState('');
  const [busy, setBusy] = useState(false);
  const [rc,   setRc]   = useState({ heading:'Create Account', sub:'Join our community of readers', btn:'Create Account', already_have:'Already have an account?', sign_in_link:'Sign in', closed_heading:'Registrations Closed', closed_sub:'New account creation is currently disabled. Please check back later.' });

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'register_content')).then(snap => {
      if (snap.exists()) setRc(prev => ({ ...prev, ...snap.data() }));
    }).catch(() => {});
  }, []);

  if (siteControls?.disableRegistration) {
    return (
      <main className="auth-page">
        <div className="auth-wrap">
          <div className="auth-card card" style={{ textAlign:'center' }}>
            <div style={{ fontSize:'3rem', marginBottom:16 }}>🚫</div>
            <h2>Registrations Closed</h2>
            <p style={{ color:'var(--muted)', marginTop:8, marginBottom:20 }}>New account creation is currently disabled. Please check back later.</p>
            <Link to="/login" className="btn btn-primary" style={{ width:'100%' }}>Sign In Instead</Link>
          </div>
        </div>
      </main>
    );
  }

  const submit = async e => {
    e.preventDefault(); setErr('');
    if (form.password !== form.confirm) { setErr('Passwords do not match'); return; }
    if (form.password.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setBusy(true);

    const emailKey = form.email.trim().toLowerCase();

    try {
      // Check if email already exists in Firestore users collection
      const q = query(collection(db, 'users'), where('email', '==', emailKey));
      const existing = await getDocs(q);
      if (!existing.empty) { setErr('An account with this email already exists.'); setBusy(false); return; }

      // Also check legacy localStorage
      const legacyUsers = JSON.parse(localStorage.getItem('eh_registered_users') || '[]');
      if (legacyUsers.find(u => u.email?.toLowerCase() === emailKey)) {
        setErr('An account with this email already exists.'); setBusy(false); return;
      }

      const userId = 'u_' + Date.now();
      const joined = new Date().toISOString().slice(0, 10);

      // 1. Save to Firestore users collection (for login)
      await setDoc(doc(db, 'users', userId), {
        id: userId, name: form.name.trim(), email: emailKey,
        passwordHash: form.password, role: 'user',
        joined, createdAt: serverTimestamp(), status: 'active',
      });

      // 2. Sync to site_data/registered_users so admin panel real-time listener picks it up
      const userEntry = { id: userId, name: form.name.trim(), email: emailKey, role: 'user', joined };
      const regSnap = await getDoc(doc(db, 'site_data', 'registered_users'));
      const currentList = regSnap.exists() ? (regSnap.data().registered || []) : [];
      if (!currentList.find(u => u.email?.toLowerCase() === emailKey)) {
        await setDoc(doc(db, 'site_data', 'registered_users'), {
          registered: [...currentList, userEntry],
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      // 3. Update localStorage so login works immediately on this device
      const local = JSON.parse(localStorage.getItem('eh_registered_users') || '[]');
      if (!local.find(u => u.email?.toLowerCase() === emailKey)) {
        localStorage.setItem('eh_registered_users', JSON.stringify([
          ...local, { ...userEntry, password: form.password }
        ]));
      }

      setUser({ id: userId, name: form.name.trim(), email: emailKey, role: 'user' });
      navigate('/');
    } catch (err) {
      console.error('[Register]', err);
      // Fallback: save to localStorage only if Firestore fails
      const legacyUsers = JSON.parse(localStorage.getItem('eh_registered_users') || '[]');
      const userId = 'u_' + Date.now();
      const joined = new Date().toISOString().slice(0, 10);
      const userEntry = { id: userId, name: form.name.trim(), email: emailKey, password: form.password, role: 'user', joined };
      localStorage.setItem('eh_registered_users', JSON.stringify([...legacyUsers, userEntry]));
      setUser({ id: userId, name: form.name.trim(), email: emailKey, role: 'user' });
      navigate('/');
    }
    setBusy(false);
  };

  const f = (k, v) => setForm({ ...form, [k]:v });
  const toggleShow = k => setShow(s => ({ ...s, [k]:!s[k] }));

  return (
    <main className="auth-page">
      <div className="auth-wrap">
        <div className="auth-card card">
          <div className="auth-top">
            <Link to="/"><img src="/logo-nobg3.png" alt="Ellines Haven" className="auth-logo-img" /></Link>
            <h2>Create Account</h2>
            <p>Join our community of readers</p>
          </div>
          <form onSubmit={submit}>
            {err && <div className="form-error" style={{ marginBottom:'16px' }}>{err}</div>}

            {/* Name */}
            <div className="form-group" style={{ marginBottom:'15px' }}>
              <label>Full Name</label>
              <input className="field" type="text" placeholder="Mark Joseph" value={form.name} onChange={e => f('name', e.target.value)} required />
            </div>

            {/* Email */}
            <div className="form-group" style={{ marginBottom:'15px' }}>
              <label>Email</label>
              <input className="field" type="email" placeholder="your@email.com" value={form.email} onChange={e => f('email', e.target.value)} required />
            </div>

            {/* Password */}
            <div className="form-group" style={{ marginBottom:'15px' }}>
              <label>Password</label>
              <div className="auth-pw-wrap">
                <input
                  className="field"
                  type={show.password ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  value={form.password}
                  onChange={e => f('password', e.target.value)}
                  required
                />
                <button type="button" className="auth-pw-eye" onClick={() => toggleShow('password')} aria-label="Toggle password">
                  <EyeIcon open={show.password} />
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="form-group" style={{ marginBottom:'15px' }}>
              <label>Confirm Password</label>
              <div className="auth-pw-wrap">
                <input
                  className="field"
                  type={show.confirm ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={form.confirm}
                  onChange={e => f('confirm', e.target.value)}
                  required
                />
                <button type="button" className="auth-pw-eye" onClick={() => toggleShow('confirm')} aria-label="Toggle confirm password">
                  <EyeIcon open={show.confirm} />
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width:'100%', marginTop:'6px' }} disabled={busy}>
              {busy ? 'Creating Account…' : 'Create Account'}
            </button>
          </form>
          <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
      </div>
    </main>
  );
}
