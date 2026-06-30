import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import './Auth.css';

/* ── The ONE hardcoded account is the super admin only.
   Password is NOT stored here — it lives in Firestore `site_data/admin_credentials`.
   All other users are in Firestore `users` collection.
   localStorage is used ONLY for the active session token (eh_user) and cart.
── */
export const SUPER_ADMIN_EMAIL = 'ellines.haven@gmail.com';

/* ── Load user from Firestore `users` collection ── */
export async function findUserInFirestore(email) {
  try {
    const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
    const snap = await getDocs(q);
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch {}
  return null;
}

/* ── Check admin credentials from Firestore (not source code) ── */
async function checkAdminCredentials(email, password) {
  try {
    const snap = await getDoc(doc(db, 'site_data', 'admin_credentials'));
    if (snap.exists()) {
      const data = snap.data();
      const admins = data.accounts || [];
      // Check accounts array first
      const found = admins.find(a => a.email.toLowerCase() === email.toLowerCase() && a.password === password);
      if (found) return found;
      // Also check pwOverrides stored in same doc
      const pwMap = data.pwOverrides || {};
      const byEmail = admins.find(a => a.email.toLowerCase() === email.toLowerCase());
      if (byEmail && pwMap[email.toLowerCase()] === password) return byEmail;
    }
    // Bootstrap: seed Firestore with super admin credentials on first run
    if (email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      const bootstrapEntry = {
        email: SUPER_ADMIN_EMAIL,
        role: 'superadmin',
        name: 'Admin',
        id: 'admin01',
        password: password, // store whatever password they successfully use
      };
      await setDoc(doc(db, 'site_data', 'admin_credentials'), {
        accounts: [bootstrapEntry],
        updatedAt: serverTimestamp(),
      }, { merge: true });
      return bootstrapEntry;
    }
  } catch (e) {
    console.warn('[checkAdminCredentials]', e.message);
  }
  return null;
}

/* ── Also check localStorage pw_overrides for backward compat during transition ── */
export function getAccounts() {
  const overrides   = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
  const roleChanges = JSON.parse(localStorage.getItem('eh_role_overrides') || '{}');
  const registered  = JSON.parse(localStorage.getItem('eh_registered_users') || '[]');
  const deleted     = JSON.parse(localStorage.getItem('eh_deleted_users') || '[]');
  const suspFs      = JSON.parse(localStorage.getItem('eh_suspended_fs') || '[]');
  const suspLeg     = JSON.parse(localStorage.getItem('eh_suspended_users') || '[]');
  const suspended   = [...new Set([...suspFs, ...suspLeg])];

  // Only registered users — NO hardcoded test accounts
  const all = registered.filter(r => !deleted.includes(r.email?.toLowerCase()));

  return all.map(a => ({
    ...a,
    password:  overrides[a.email?.toLowerCase()] || a.password || '',
    role:      roleChanges[a.email?.toLowerCase()] || a.role || 'user',
    suspended: suspended.includes(a.email?.toLowerCase()),
  }));
}

function EyeIcon({ open }) {
  return open
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
}

/* ── Forgot Password Modal ── */
function ForgotPasswordModal({ onClose }) {
  const [email,       setEmail]       = useState('');
  const [step,        setStep]        = useState('email');
  const [code,        setCode]        = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [err,         setErr]         = useState('');
  const [success,     setSuccess]     = useState('');
  const [showPw,      setShowPw]      = useState(false);

  const handleSendCode = async e => {
    e.preventDefault(); setErr('');
    // Check Firestore users first, then legacy localStorage
    const fsUser = await findUserInFirestore(email).catch(() => null);
    const legacyUsers = getAccounts();
    const found = fsUser || legacyUsers.find(a => a.email?.toLowerCase() === email.toLowerCase());
    // Also allow admin email
    const isAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    if (!found && !isAdmin) { setErr('No account found with that email address.'); return; }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setCode(otp); setStep('sent');
  };

  const handleVerifyCode = e => {
    e.preventDefault(); setErr('');
    if (enteredCode !== code) { setErr('Incorrect code. Please try again.'); return; }
    setStep('reset');
  };

  const handleReset = async e => {
    e.preventDefault(); setErr('');
    if (newPw.length < 4) { setErr('Password must be at least 4 characters.'); return; }
    if (newPw !== confirmPw) { setErr('Passwords do not match.'); return; }
    const overrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
    overrides[email.toLowerCase()] = newPw;
    localStorage.setItem('eh_pw_overrides', JSON.stringify(overrides));
    // Also save to Firestore user doc if it exists
    try {
      const fsUser = await findUserInFirestore(email);
      if (fsUser) await setDoc(doc(db, 'users', fsUser.id), { passwordHash: newPw, updatedAt: serverTimestamp() }, { merge: true });
    } catch {}
    setSuccess('Password reset successfully! You can now sign in.');
    setStep('done');
  };

  return (
    <div className="reset-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="reset-modal card">
        <div className="reset-modal-head">
          <h3>Reset Password</h3>
          <button className="auth-close-btn" onClick={onClose}>✕</button>
        </div>
        {step === 'email' && (
          <form onSubmit={handleSendCode} className="reset-body">
            <p>Enter your account email and we'll send a reset code.</p>
            {err && <div className="form-error">{err}</div>}
            <div className="form-group"><label>Email Address</label>
              <input className="field" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" required autoFocus /></div>
            <button type="submit" className="btn btn-primary" style={{width:'100%'}}>Send Reset Code</button>
          </form>
        )}
        {step === 'sent' && (
          <form onSubmit={handleVerifyCode} className="reset-body">
            <p>A 6-digit code has been sent to <strong style={{color:'var(--gold)'}}>{email}</strong>.</p>
            <div className="reset-demo-note">
              <strong>Code:</strong> <strong style={{color:'var(--gold)',fontSize:'1.2em',letterSpacing:3}}>{code}</strong>
              <br/><small>(In production this would arrive by email/SMS)</small>
            </div>
            {err && <div className="form-error">{err}</div>}
            <div className="form-group"><label>Enter 6-Digit Code</label>
              <input className="field" type="text" maxLength="6" value={enteredCode} onChange={e=>setEnteredCode(e.target.value)} placeholder="123456" required autoFocus style={{letterSpacing:4,fontSize:'1.2rem',textAlign:'center'}} /></div>
            <button type="submit" className="btn btn-primary" style={{width:'100%'}}>Verify Code</button>
            <button type="button" className="btn btn-ghost" style={{width:'100%',marginTop:8}} onClick={()=>setStep('email')}>← Back</button>
          </form>
        )}
        {step === 'reset' && (
          <form onSubmit={handleReset} className="reset-body">
            <p>Create a new password for <strong style={{color:'var(--gold)'}}>{email}</strong></p>
            {err && <div className="form-error">{err}</div>}
            <div className="form-group"><label>New Password</label>
              <div className="auth-pw-wrap">
                <input className="field" type={showPw?'text':'password'} value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Minimum 4 characters" required />
                <button type="button" className="auth-pw-eye" onClick={()=>setShowPw(v=>!v)}><EyeIcon open={showPw}/></button>
              </div></div>
            <div className="form-group"><label>Confirm</label>
              <input className="field" type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Repeat password" required /></div>
            <button type="submit" className="btn btn-primary" style={{width:'100%'}}>Set New Password</button>
          </form>
        )}
        {step === 'done' && (
          <div className="reset-body" style={{textAlign:'center'}}>
            <div style={{fontSize:'2.5rem',marginBottom:12}}>✅</div>
            <p style={{color:'var(--ok)',fontWeight:600,marginBottom:16}}>{success}</p>
            <button className="btn btn-primary" style={{width:'100%'}} onClick={onClose}>Sign In Now</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  const { setUser } = useApp();
  const navigate    = useNavigate();
  const loc         = useLocation();
  const from        = loc.state?.from?.pathname || '/';
  const [form,      setForm]      = useState({ email:'', password:'' });
  const [showPw,    setShowPw]    = useState(false);
  const [err,       setErr]       = useState('');
  const [busy,      setBusy]      = useState(false);
  const [showReset, setShowReset] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setErr(''); setBusy(true);

    const emailKey = form.email.trim().toLowerCase();

    try {
      /* 1. Check Firestore users collection first */
      const fsUser = await findUserInFirestore(emailKey);
      if (fsUser) {
        const storedPw = localStorage.getItem('eh_pw_overrides')
          ? JSON.parse(localStorage.getItem('eh_pw_overrides'))[emailKey] || fsUser.passwordHash || fsUser.password
          : fsUser.passwordHash || fsUser.password;
        if (fsUser.suspended) { setErr('This account has been suspended. Contact support.'); setBusy(false); return; }
        if (storedPw && storedPw !== form.password) { setErr('Wrong password. Please try again.'); setBusy(false); return; }
        const sessionUser = { id: fsUser.id, name: fsUser.name, email: fsUser.email, role: fsUser.role || 'user' };
        setUser(sessionUser);
        await logLogin(fsUser.email);
        navigate(from, { replace: true }); setBusy(false); return;
      }

      /* 2. Check admin credentials in Firestore */
      const adminAccount = await checkAdminCredentials(emailKey, form.password);
      if (adminAccount) {
        const sessionUser = { id: adminAccount.id || 'admin01', name: adminAccount.name || 'Admin', email: adminAccount.email, role: adminAccount.role };
        setUser(sessionUser);
        await logLogin(adminAccount.email);
        navigate(from, { replace: true }); setBusy(false); return;
      }

      /* 3. Legacy: check localStorage registered users (transition period) */
      const legacy = getAccounts();
      const legacyAccount = legacy.find(a => a.email?.toLowerCase() === emailKey);
      if (legacyAccount) {
        if (legacyAccount.suspended) { setErr('This account has been suspended.'); setBusy(false); return; }
        if (legacyAccount.password !== form.password) { setErr('Wrong password. Please try again.'); setBusy(false); return; }
        // Migrate to Firestore
        try {
          await setDoc(doc(db, 'users', legacyAccount.id || emailKey.replace(/[^a-z0-9]/g,'_')), {
            name: legacyAccount.name, email: legacyAccount.email, role: legacyAccount.role || 'user',
            passwordHash: legacyAccount.password, migratedAt: serverTimestamp(),
          }, { merge: true });
        } catch {}
        const sessionUser = { id: legacyAccount.id, name: legacyAccount.name, email: legacyAccount.email, role: legacyAccount.role || 'user' };
        setUser(sessionUser);
        await logLogin(legacyAccount.email);
        navigate(from, { replace: true }); setBusy(false); return;
      }

      setErr('No account found with that email address.');
    } catch (e) {
      setErr('Sign in failed. Please try again.');
      console.error('[Login]', e);
    }
    setBusy(false);
  };

  return (
    <main className="auth-page">
      {showReset && <ForgotPasswordModal onClose={() => setShowReset(false)} />}
      <div className="auth-wrap">
        <div className="auth-card card">
          <div className="auth-top">
            <Link to="/"><img src="/logo-nobg3.png" alt="Ellines Haven" className="auth-logo-img" /></Link>
            <h2>Welcome Back</h2>
            <p>Sign in to access your library</p>
          </div>
          <form onSubmit={submit}>
            {err && <div className="form-error" style={{marginBottom:'16px'}}>{err}</div>}
            <div className="form-group" style={{marginBottom:'16px'}}>
              <label>Email</label>
              <input className="field" type="email" placeholder="your@email.com"
                value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required />
            </div>
            <div className="form-group" style={{marginBottom:'8px'}}>
              <label>Password</label>
              <div className="auth-pw-wrap">
                <input className="field" type={showPw?'text':'password'} placeholder="Your password"
                  value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required />
                <button type="button" className="auth-pw-eye" onClick={()=>setShowPw(v=>!v)} aria-label={showPw?'Hide':'Show'}>
                  <EyeIcon open={showPw}/>
                </button>
              </div>
            </div>
            <div style={{textAlign:'right',marginBottom:'22px'}}>
              <button type="button" onClick={()=>setShowReset(true)}
                style={{background:'none',border:'none',color:'var(--gold)',fontSize:'0.82rem',cursor:'pointer',padding:0,textDecoration:'underline'}}>
                Forgot password?
              </button>
            </div>
            <button type="submit" className="btn btn-primary" style={{width:'100%'}} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <p className="auth-switch">No account? <Link to="/register">Create one</Link></p>
        </div>
      </div>
    </main>
  );
}

async function logLogin(email) {
  try {
    const logsDoc = doc(db, 'site_data', 'system_logs');
    const snap = await getDoc(logsDoc);
    const existing = snap.exists() ? (snap.data().logs || []) : [];
    const entry = { time: new Date().toISOString().slice(0,16).replace('T',' '), type:'auth', event:'Login: '+email, user:email, ip:'browser', status:'success' };
    await setDoc(logsDoc, { logs: [entry, ...existing].slice(0,500), updatedAt: serverTimestamp() }, { merge: false });
  } catch {}
}
