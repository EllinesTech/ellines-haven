import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useEditMode } from '../context/EditModeContext';
import EditableField from '../components/EditableField';
import { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import './Auth.css';

function EyeIcon({ open }) {
  return open
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
}

// Helper: determine device type for logging
function getDeviceTypeForReg() {
  const ua = navigator.userAgent.toLowerCase();
  if (/mobile|android|iphone/.test(ua)) return /ipad|tablet/.test(ua) ? 'Tablet' : 'Mobile';
  if (/windows|win32/.test(ua)) return 'Windows';
  if (/macintosh|mac os/.test(ua)) return 'Mac';
  if (/linux/.test(ua)) return 'Linux';
  return 'Desktop';
}

export default function Register() {
  const { setUser, siteControls } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name:'', email:'', password:'', confirm:'', phone:'' });
  const [show, setShow] = useState({ password:false, confirm:false });
  const [err,  setErr]  = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [acceptedCookies, setAcceptedCookies] = useState(false);
  const [emailStatus, setEmailStatus] = useState(''); // 'checking' | 'taken' | 'ok' | ''
  const [pwStrength, setPwStrength]   = useState(0);   // 0-4
  const [rc,   setRc]   = useState({ heading:'Create Account', sub:'Join our community of readers', btn:'Create Account', already_have:'Already have an account?', sign_in_link:'Sign in', closed_heading:'Registrations Closed', closed_sub:'New account creation is currently disabled. Please check back later.' });
  const editCtx = useEditMode();

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'register_content')).then(snap => {
      if (snap.exists()) setRc(prev => ({ ...prev, ...snap.data() }));
    }).catch(() => {});
  }, []);

  const cv = (editCtx?.editMode && editCtx?.pageKey === 'register_content')
    ? { ...rc, ...editCtx.pageData } : rc;

  // ── Real-time email duplicate check on blur ───────────────────────────────
  const checkEmailExists = async (email) => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailStatus(''); return; }
    setEmailStatus('checking');
    try {
      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) { setEmailStatus('taken'); return; }
      const legacy = JSON.parse(localStorage.getItem('eh_registered_users') || '[]');
      if (legacy.find(u => u.email?.toLowerCase() === email.toLowerCase())) { setEmailStatus('taken'); return; }
      setEmailStatus('ok');
    } catch { setEmailStatus(''); }
  };

  // ── Password strength scorer ──────────────────────────────────────────────
  const scorePw = (pw) => {
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 8)  s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(s, 4);
  };

  const pwColors = ['', '#e74c3c', '#e8832a', '#f1c40f', '#2ecc71'];
  const pwLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  if (siteControls?.disableRegistration) {
    return (
      <main className="auth-page">
        <div className="auth-wrap">
          <div className="auth-card card" style={{ textAlign:'center' }}>
            <div style={{ fontSize:'3rem', marginBottom:16 }}>🚫</div>
            <h2>Registrations Closed</h2>
            <p style={{ color:'var(--muted)', marginTop:8, marginBottom:20 }}>
              <EditableField field="closed_sub">{cv.closed_sub}</EditableField>
            </p>
            <Link to="/login" className="btn btn-primary" style={{ width:'100%' }}>Sign In Instead</Link>
          </div>
        </div>
      </main>
    );
  }

  const submit = async e => {
    e.preventDefault(); setErr('');
    if (!acceptedPolicy) {
      setErr('You must agree to our Terms of Service and Privacy Policy to create an account.');
      return;
    }
    if (!acceptedCookies) {
      setErr('You must accept our cookie and local storage policy to continue.');
      return;
    }
    if (emailStatus === 'taken') {
      setErr('⚠️ That email is already registered. Please sign in or use a different email.');
      return;
    }
    if (form.password !== form.confirm) {
      setErr('Passwords do not match. Please re-enter your password.');
      return;
    }
    if (form.password.length < 6) {
      setErr('Your password must be at least 6 characters long.');
      return;
    }
    setBusy(true);

    const emailKey = form.email.trim().toLowerCase();

    try {
      // Check if email already exists in Firestore users collection
      const q = query(collection(db, 'users'), where('email', '==', emailKey));
      const existing = await getDocs(q);
      if (!existing.empty) {
        setErr('⚠️ That email is already registered. Please sign in or use a different email.');
        setEmailStatus('taken');
        setBusy(false); return;
      }

      // Also check legacy localStorage
      const legacyUsers = JSON.parse(localStorage.getItem('eh_registered_users') || '[]');
      if (legacyUsers.find(u => u.email?.toLowerCase() === emailKey)) {
        setErr('⚠️ That email is already registered. Please sign in or use a different email.');
        setEmailStatus('taken');
        setBusy(false); return;
      }

      const userId = 'u_' + Date.now();
      const joined = new Date().toISOString().slice(0, 10);

      // 1. Save to Firestore users collection (PRIMARY SOURCE — for login)
      await setDoc(doc(db, 'users', userId), {
        id: userId, name: form.name.trim(), email: emailKey,
        phone: form.phone.trim() || '',
        passwordHash: form.password, role: 'user',
        joined, createdAt: serverTimestamp(), status: 'active',
      });

      // 2. Sync to site_data/registered_users so admin panel real-time listener picks it up
      const userEntry = { id: userId, name: form.name.trim(), email: emailKey, phone: form.phone.trim() || '', role: 'user', joined };
      const regSnap = await getDoc(doc(db, 'site_data', 'registered_users'));
      const currentList = regSnap.exists() ? (regSnap.data().registered || []) : [];
      const currentPwOverrides = regSnap.exists() ? (regSnap.data().pwOverrides || {}) : {};
      if (!currentList.find(u => u.email?.toLowerCase() === emailKey)) {
        await setDoc(doc(db, 'site_data', 'registered_users'), {
          registered: [...currentList, userEntry],
          pwOverrides: { ...currentPwOverrides, [emailKey]: form.password },
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
      // Also sync password overrides
      const localPwOverrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
      localPwOverrides[emailKey] = form.password;
      localStorage.setItem('eh_pw_overrides', JSON.stringify(localPwOverrides));

      setUser({ id: userId, name: form.name.trim(), email: emailKey, role: 'user' });
      
      // ── Track registration in admin activity panel (direct + cloud function) ──
      const regDevice = getDeviceTypeForReg();
      try {
        const { trackActivity, NOTIFICATION_CATEGORIES } = await import('../utils/adminActivityTracker');
        await trackActivity({
          category: NOTIFICATION_CATEGORIES.USER_REGISTRATION,
          title:    'New User Registration',
          message:  `${form.name.trim()} (${emailKey}) joined Ellines Haven`,
          userEmail: emailKey,
          userName:  form.name.trim(),
          metadata:  { device: regDevice, joinedAt: new Date().toISOString() },
          priority: 'normal',
        });
      } catch (e) { console.warn('[Register] trackActivity failed:', e.message); }
      // Cloud Function for IP/geolocation (best-effort, non-blocking)
      import('../utils/reliableActivityLogger').then(({ logUserRegistrationReliable }) =>
        logUserRegistrationReliable(emailKey, form.name.trim(), { device: regDevice })
      ).catch(() => {});
      
      setSuccessMsg(`Welcome to Ellines Haven, ${form.name.trim()}! Your account has been created. Redirecting…`);
      setTimeout(() => navigate('/'), 1800);
    } catch (err) {
      console.error('[Register]', err);
      // Fallback: save to localStorage only if Firestore fails
      const legacyUsers = JSON.parse(localStorage.getItem('eh_registered_users') || '[]');
      const userId = 'u_' + Date.now();
      const joined = new Date().toISOString().slice(0, 10);
      const userEntry = { id: userId, name: form.name.trim(), email: emailKey, password: form.password, role: 'user', joined };
      localStorage.setItem('eh_registered_users', JSON.stringify([...legacyUsers, userEntry]));
      setUser({ id: userId, name: form.name.trim(), email: emailKey, role: 'user' });
      
      // ── Track registration even in fallback path ──
      const regDeviceFb = getDeviceTypeForReg();
      import('../utils/adminActivityTracker').then(({ trackActivity, NOTIFICATION_CATEGORIES }) =>
        trackActivity({
          category: NOTIFICATION_CATEGORIES.USER_REGISTRATION,
          title:    'New User Registration',
          message:  `${form.name.trim()} (${emailKey}) joined Ellines Haven`,
          userEmail: emailKey, userName: form.name.trim(),
          metadata:  { device: regDeviceFb, joinedAt: new Date().toISOString() },
          priority: 'normal',
        })
      ).catch(() => {});
      import('../utils/reliableActivityLogger').then(({ logUserRegistrationReliable }) =>
        logUserRegistrationReliable(emailKey, form.name.trim(), { device: regDeviceFb })
      ).catch(() => {});
      
      setSuccessMsg(`Welcome to Ellines Haven, ${form.name.trim()}! Your account has been created. Redirecting…`);
      setTimeout(() => navigate('/'), 1800);
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
            <h2><EditableField field="heading">{cv.heading}</EditableField></h2>
            <p><EditableField field="sub">{cv.sub}</EditableField></p>
          </div>
          <form onSubmit={submit}>
            {err && (
              <div className="form-error auth-alert" role="alert" style={{ marginBottom:'16px' }}>
                <span className="auth-alert-icon">⚠️</span> {err}
              </div>
            )}
            {successMsg && (
              <div className="form-success auth-alert" role="status" style={{ marginBottom:'16px' }}>
                <span className="auth-alert-icon">✅</span> {successMsg}
              </div>
            )}

            {/* Name */}
            <div className="form-group" style={{ marginBottom:'15px' }}>
              <label>Full Name</label>
              <input className="field" type="text" placeholder="Mark Joseph" value={form.name} onChange={e => f('name', e.target.value)} required />
            </div>

            {/* Email */}
            <div className="form-group" style={{ marginBottom:'15px' }}>
              <label>Email</label>
              <div style={{ position:'relative' }}>
                <input className="field" type="email" placeholder="your@email.com" value={form.email}
                  onChange={e => { f('email', e.target.value); setEmailStatus(''); }}
                  onBlur={e => checkEmailExists(e.target.value)}
                  required
                  style={{ paddingRight: emailStatus ? 36 : undefined,
                           borderColor: emailStatus === 'taken' ? '#e74c3c' : emailStatus === 'ok' ? '#2ecc71' : undefined }}
                />
                {emailStatus === 'checking' && (
                  <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:'0.8rem', color:'var(--muted)' }}>⏳</span>
                )}
                {emailStatus === 'taken' && (
                  <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:'1rem' }}>❌</span>
                )}
                {emailStatus === 'ok' && (
                  <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:'1rem' }}>✅</span>
                )}
              </div>
              {emailStatus === 'taken' && (
                <p style={{ color:'#e74c3c', fontSize:'0.78rem', marginTop:5, marginBottom:0 }}>
                  ⚠️ An account with this email already exists.{' '}
                  <a href="/login" style={{ color:'var(--gold)' }}>Sign in instead?</a>
                </p>
              )}
            </div>

            {/* Phone (optional, used for SMS password reset) */}
            <div className="form-group" style={{ marginBottom:'15px' }}>
              <label>Phone Number <span style={{ color:'var(--muted)', fontWeight:400, fontSize:'0.78rem' }}>(for SMS password reset — optional)</span></label>
              <input className="field" type="tel" placeholder="+254 7XX XXX XXX" value={form.phone}
                onChange={e => f('phone', e.target.value)} />
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
                  onChange={e => { f('password', e.target.value); setPwStrength(scorePw(e.target.value)); }}
                  required
                />
                <button type="button" className="auth-pw-eye" onClick={() => toggleShow('password')} aria-label="Toggle password">
                  <EyeIcon open={show.password} />
                </button>
              </div>
              {/* Password strength indicator */}
              {form.password.length > 0 && (
                <div style={{ marginTop:7 }}>
                  <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{ flex:1, height:4, borderRadius:3, background: i <= pwStrength ? pwColors[pwStrength] : 'rgba(255,255,255,0.1)', transition:'background 0.2s' }} />
                    ))}
                  </div>
                  {pwStrength > 0 && (
                    <span style={{ fontSize:'0.72rem', color: pwColors[pwStrength], fontWeight:600 }}>
                      {pwLabels[pwStrength]} password
                      {pwStrength < 3 && ' — add uppercase, numbers or symbols to strengthen it'}
                    </span>
                  )}
                </div>
              )}
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

            {/* Policy Acceptance */}
            <div className="auth-policy-box">
              <label className="auth-policy-check">
                <input
                  type="checkbox"
                  checked={acceptedPolicy}
                  onChange={e => setAcceptedPolicy(e.target.checked)}
                  required
                />
                <span>
                  I have read and agree to the{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                </span>
              </label>
              <label className="auth-policy-check" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={acceptedCookies}
                  onChange={e => setAcceptedCookies(e.target.checked)}
                  required
                />
                <span>
                  I accept the use of browser local storage (cookies) to keep me signed in, remember my cart, and save my preferences.
                </span>
              </label>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width:'100%', marginTop:'6px' }} disabled={busy}>
              {busy ? 'Creating Account…' : cv.btn}
            </button>
          </form>
          <p className="auth-switch">
            <EditableField field="already_have">{cv.already_have}</EditableField>{' '}
            <Link to="/login"><EditableField field="sign_in_link">{cv.sign_in_link}</EditableField></Link>
          </p>
        </div>
      </div>
    </main>
  );
}
