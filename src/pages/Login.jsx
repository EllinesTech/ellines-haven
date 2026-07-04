import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useEditMode } from '../context/EditModeContext';
import EditableField from '../components/EditableField';
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
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

/* ── Password attempt tracking ──────────────────────────────────────────────── */
const MAX_ATTEMPTS   = 5;
const LOCKOUT_MS     = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_KEY    = 'eh_login_attempts';

function getAttemptData(emailKey) {
  try {
    const all = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
    return all[emailKey] || { count: 0, firstAt: null, lockedUntil: null };
  } catch { return { count: 0, firstAt: null, lockedUntil: null }; }
}

function recordFailedAttempt(emailKey) {
  try {
    const all  = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
    const data = all[emailKey] || { count: 0, firstAt: Date.now(), lockedUntil: null };
    data.count = (data.count || 0) + 1;
    data.firstAt = data.firstAt || Date.now();
    if (data.count >= MAX_ATTEMPTS) {
      data.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    all[emailKey] = data;
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(all));
    return data;
  } catch { return { count: 0 }; }
}

function clearAttempts(emailKey) {
  try {
    const all = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}');
    delete all[emailKey];
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(all));
  } catch {}
}

function getLockoutMessage(data) {
  if (!data?.lockedUntil) return null;
  const remaining = data.lockedUntil - Date.now();
  if (remaining <= 0) return null;
  const mins = Math.ceil(remaining / 60000);
  return `Too many failed attempts. Please try again in ${mins} minute${mins !== 1 ? 's' : ''}.`;
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
  const [sending,     setSending]     = useState(false);
  const [deliveredTo, setDeliveredTo] = useState([]); // ['email','sms']

  const handleSendCode = async e => {
    e.preventDefault(); setErr(''); setSending(true);
    // Check Firestore users first, then legacy localStorage
    const fsUser = await findUserInFirestore(email).catch(() => null);
    const legacyUsers = getAccounts();
    const found = fsUser || legacyUsers.find(a => a.email?.toLowerCase() === email.toLowerCase());
    const isAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    if (!found && !isAdmin) {
      setErr('No account found with that email address. Please check and try again.');
      setSending(false); return;
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setCode(otp);

    // Attempt to send via Cloud Function (email + SMS if phone available)
    const phone = fsUser?.phone || found?.phone || '';
    const delivered = [];
    try {
      const fn = httpsCallable(getFunctions(), 'sendPasswordResetOtp');
      const result = await fn({ email, phone, otp, name: fsUser?.name || found?.name || 'Valued Reader' });
      if (result.data?.emailSent) delivered.push('email');
      if (result.data?.smsSent)  delivered.push('SMS');
    } catch (fnErr) {
      // Cloud Function not yet deployed or no credentials — OTP is still set locally
      console.warn('[ForgotPassword] Cloud Function unavailable:', fnErr.message);
    }
    setDeliveredTo(delivered);
    setSending(false);
    setStep('sent');
  };

  const handleVerifyCode = e => {
    e.preventDefault(); setErr('');
    if (enteredCode !== code) { setErr('That code is incorrect. Please check and try again.'); return; }
    setStep('reset');
  };

  const handleReset = async e => {
    e.preventDefault(); setErr('');
    if (newPw.length < 6) { setErr('Your password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setErr('Passwords do not match. Please re-enter.'); return; }
    const overrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
    overrides[email.toLowerCase()] = newPw;
    localStorage.setItem('eh_pw_overrides', JSON.stringify(overrides));
    // Also save to Firestore user doc if it exists
    try {
      const fsUser = await findUserInFirestore(email);
      if (fsUser) await setDoc(doc(db, 'users', fsUser.id), { passwordHash: newPw, updatedAt: serverTimestamp() }, { merge: true });
    } catch {}
    // Clear any lockout for this email
    clearAttempts(email.toLowerCase());
    setSuccess('Your password has been reset successfully. You can now sign in with your new password.');
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
            <p>Enter your account email and we'll send a 6-digit reset code to your email and mobile phone.</p>
            {err && <div className="form-error auth-alert" role="alert"><span className="auth-alert-icon">⚠️</span>{err}</div>}
            <div className="form-group"><label>Email Address</label>
              <input className="field" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" required autoFocus /></div>
            <button type="submit" className="btn btn-primary" style={{width:'100%'}} disabled={sending}>
              {sending ? '⏳ Sending…' : '📤 Send Reset Code'}
            </button>
          </form>
        )}
        {step === 'sent' && (
          <form onSubmit={handleVerifyCode} className="reset-body">
            {deliveredTo.length > 0 ? (
              <p>
                A 6-digit reset code was sent to{' '}
                {deliveredTo.includes('email') && <strong style={{color:'var(--gold)'}}>your email</strong>}
                {deliveredTo.includes('email') && deliveredTo.includes('SMS') && ' and '}
                {deliveredTo.includes('SMS') && <strong style={{color:'var(--gold)'}}>your mobile phone</strong>}.
              </p>
            ) : (
              <div>
                <p>We attempted to send a code to <strong style={{color:'var(--gold)'}}>{email}</strong>.</p>
                <div className="reset-demo-note">
                  <strong>Demo code:</strong> <strong style={{color:'var(--gold)',fontSize:'1.2em',letterSpacing:3}}>{code}</strong>
                  <br/><small>Configure Africa's Talking credentials to enable real SMS/email delivery.</small>
                </div>
              </div>
            )}
            {err && <div className="form-error auth-alert" role="alert"><span className="auth-alert-icon">⚠️</span>{err}</div>}
            <div className="form-group"><label>Enter 6-Digit Code</label>
              <input className="field" type="text" maxLength="6" value={enteredCode} onChange={e=>setEnteredCode(e.target.value)} placeholder="123456" required autoFocus style={{letterSpacing:4,fontSize:'1.2rem',textAlign:'center'}} /></div>
            <button type="submit" className="btn btn-primary" style={{width:'100%'}}>Verify Code</button>
            <button type="button" className="btn btn-ghost" style={{width:'100%',marginTop:8}} onClick={()=>setStep('email')}>← Back</button>
          </form>
        )}
        {step === 'reset' && (
          <form onSubmit={handleReset} className="reset-body">
            <p>Create a new password for <strong style={{color:'var(--gold)'}}>{email}</strong></p>
            {err && <div className="form-error auth-alert" role="alert"><span className="auth-alert-icon">⚠️</span>{err}</div>}
            <div className="form-group"><label>New Password</label>
              <div className="auth-pw-wrap">
                <input className="field" type={showPw?'text':'password'} value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Minimum 6 characters" required />
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
            <button className="btn btn-primary" style={{width:'100%'}} onClick={onClose}>Sign In Now →</button>
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
  const [successMsg,setSuccessMsg]= useState('');
  const [busy,      setBusy]      = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [lc,        setLc]        = useState({ heading:'Welcome Back', sub:'Sign in to access your library', btn:'Sign In', no_account:'No account?', create_link:'Create one' });

  const showLoginSuccess = (name) => {
    setSuccessMsg(`Login successful — welcome back${name ? ', ' + name : ''}! Taking you to Ellines Haven…`);
  };
  const editCtx = useEditMode();

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'login_content')).then(snap => {
      if (snap.exists()) setLc(prev => ({ ...prev, ...snap.data() }));
    }).catch(() => {});
  }, []);

  const cv = (editCtx?.editMode && editCtx?.pageKey === 'login_content')
    ? { ...lc, ...editCtx.pageData } : lc;

  const submit = async e => {
    e.preventDefault();
    setErr(''); setBusy(true);

    const emailKey = form.email.trim().toLowerCase();

    // ── Lockout check ───────────────────────────────────────────────────────
    const attemptData = getAttemptData(emailKey);
    if (attemptData.lockedUntil && Date.now() < attemptData.lockedUntil) {
      setErr(getLockoutMessage(attemptData) || 'Account temporarily locked. Please try again later.');
      setBusy(false); return;
    }
    // If lockout has expired, clear it
    if (attemptData.lockedUntil && Date.now() >= attemptData.lockedUntil) {
      clearAttempts(emailKey);
    }

    try {
      /* 1. Check Firestore users collection first */
      const fsUser = await findUserInFirestore(emailKey);
      if (fsUser) {
        if (fsUser.suspended) {
          setErr('Your account has been suspended. Please contact support at ellines.haven@gmail.com.');
          setBusy(false); return;
        }
        const pwOverrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
        const localOverride = pwOverrides[emailKey];
        const fsHash = fsUser.passwordHash || fsUser.password || '';
        const passwordOk = (localOverride && localOverride === form.password) || (fsHash && fsHash === form.password);
        if (!fsHash && !localOverride) {
          setErr('This account has no password set. Please contact support.');
          setBusy(false); return;
        }
        if (!passwordOk) {
          const data = recordFailedAttempt(emailKey);
          const remaining = MAX_ATTEMPTS - data.count;
          if (data.lockedUntil) {
            setErr(getLockoutMessage(data) || 'Too many failed attempts. Account locked.');
          } else {
            setErr(`Incorrect password. ${remaining > 0 ? remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.' : ''}`);
          }
          setBusy(false); return;
        }
        clearAttempts(emailKey);
        const sessionUser = { id: fsUser.id, name: fsUser.name, email: fsUser.email, role: fsUser.role || 'user' };
        setUser(sessionUser);
        await logLogin(fsUser.email, fsUser.name);
        showLoginSuccess(fsUser.name);
        navigate(from, { replace: true }); setBusy(false); return;
      }

      /* 2. Check admin credentials in Firestore */
      const adminAccount = await checkAdminCredentials(emailKey, form.password);
      if (adminAccount) {
        clearAttempts(emailKey);
        const sessionUser = { id: adminAccount.id || 'admin01', name: adminAccount.name || 'Admin', email: adminAccount.email, role: adminAccount.role };
        setUser(sessionUser);
        await logLogin(adminAccount.email, adminAccount.name);
        showLoginSuccess(adminAccount.name || 'Admin');
        navigate(from, { replace: true }); setBusy(false); return;
      }

      /* 3. Legacy: check localStorage registered users OR Firestore site_data/registered_users ── */
      try {
        const regSnap = await getDoc(doc(db, 'site_data', 'registered_users'));
        if (regSnap.exists()) {
          const regData = regSnap.data();
          const regUser = (regData.registered || []).find(u => u.email?.toLowerCase() === emailKey);
          if (regUser) {
            const fsPwOverrides = regData.pwOverrides || {};
            const localOverrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
            const fsPw = fsPwOverrides[emailKey] || localOverrides[emailKey] || regUser.password || '';
            
            const suspFs = JSON.parse(localStorage.getItem('eh_suspended_fs') || '[]');
            const suspLeg = JSON.parse(localStorage.getItem('eh_suspended_users') || '[]');
            const allSusp = [...new Set([...suspFs, ...suspLeg])];
            if (allSusp.includes(emailKey) || regUser.suspended) {
              setErr('Your account has been suspended. Please contact support at ellines.haven@gmail.com.');
              setBusy(false); return;
            }
            
            if (!fsPw) {
              setErr('This account has no password set. Please contact support.');
              setBusy(false); return;
            }
            if (fsPw !== form.password) {
              const data = recordFailedAttempt(emailKey);
              const remaining = MAX_ATTEMPTS - data.count;
              if (data.lockedUntil) {
                setErr(getLockoutMessage(data) || 'Too many failed attempts. Account locked.');
              } else {
                setErr(`Incorrect password. ${remaining > 0 ? remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.' : ''}`);
              }
              setBusy(false); return;
            }
            clearAttempts(emailKey);
            
            const uid = regUser.id || ('u_' + Date.now());
            const joined = regUser.joined || new Date().toISOString().slice(0, 10);
            await setDoc(doc(db, 'users', uid), {
              id: uid, name: regUser.name, email: emailKey,
              role: regUser.role || 'user', passwordHash: fsPw,
              joined, migratedAt: serverTimestamp(), status: 'active',
            }, { merge: true }).catch((e) => {
              console.warn('[Login] Auto-migration to users collection failed:', e.message);
            });
            
            localStorage.setItem('eh_registered_users', JSON.stringify(regData.registered));
            const localPwOverrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
            localPwOverrides[emailKey] = fsPw;
            localStorage.setItem('eh_pw_overrides', JSON.stringify(localPwOverrides));
            
            const sessionUser = { id: uid, name: regUser.name, email: emailKey, role: regUser.role || 'user' };
            setUser(sessionUser);
            await logLogin(emailKey, regUser.name);
            showLoginSuccess(regUser.name);
            navigate(from, { replace: true }); setBusy(false); return;
          }
        }
      } catch (e) {
        console.warn('[Login] Firestore registered_users check failed:', e.message);
      }

      /* 4. Last resort — localStorage registered users */
      const legacy = getAccounts();
      const legacyAccount = legacy.find(a => a.email?.toLowerCase() === emailKey);
      if (legacyAccount) {
        if (legacyAccount.suspended) {
          setErr('Your account has been suspended. Please contact support at ellines.haven@gmail.com.');
          setBusy(false); return;
        }
        const effectivePw = legacyAccount.password;
        if (effectivePw !== form.password) {
          const data = recordFailedAttempt(emailKey);
          const remaining = MAX_ATTEMPTS - data.count;
          if (data.lockedUntil) {
            setErr(getLockoutMessage(data) || 'Too many failed attempts. Account locked.');
          } else {
            setErr(`Incorrect password. ${remaining > 0 ? remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.' : ''}`);
          }
          setBusy(false); return;
        }
        clearAttempts(emailKey);
        const sessionUser = { id: legacyAccount.id, name: legacyAccount.name, email: legacyAccount.email, role: legacyAccount.role || 'user' };
        setUser(sessionUser);
        await logLogin(legacyAccount.email, legacyAccount.name);
        showLoginSuccess(legacyAccount.name);
        navigate(from, { replace: true }); setBusy(false); return;
      }

      setErr('No account found with that email address. Please check your email or create an account.');
    } catch (e) {
      setErr('Something went wrong. Please check your connection and try again.');
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
            <h2><EditableField field="heading">{cv.heading}</EditableField></h2>
            <p><EditableField field="sub">{cv.sub}</EditableField></p>
          </div>
          <form onSubmit={submit}>
            {err && (
              <div className="form-error auth-alert" role="alert" style={{marginBottom:'16px'}}>
                <span className="auth-alert-icon">⚠️</span> {err}
              </div>
            )}
            {successMsg && (
              <div className="form-success auth-alert" role="status" style={{marginBottom:'16px'}}>
                <span className="auth-alert-icon">✅</span> {successMsg}
              </div>
            )}
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
              {busy ? 'Signing in…' : cv.btn}
            </button>
          </form>
          <p className="auth-switch">
            <EditableField field="no_account">{cv.no_account}</EditableField>{' '}
            <Link to="/register"><EditableField field="create_link">{cv.create_link}</EditableField></Link>
          </p>
        </div>
      </div>
    </main>
  );
}

async function logLogin(email, userName) {
  try {
    // Log to system logs
    const logsDoc = doc(db, 'site_data', 'system_logs');
    const snap = await getDoc(logsDoc);
    const existing = snap.exists() ? (snap.data().logs || []) : [];
    const entry = { time: new Date().toISOString().slice(0,16).replace('T',' '), type:'auth', event:'Login: '+email, user:email, ip:'browser', status:'success' };
    await setDoc(logsDoc, { logs: [entry, ...existing].slice(0,500), updatedAt: serverTimestamp() }, { merge: true });
    
    // Track activity and notify admins
    const { trackActivity, NOTIFICATION_CATEGORIES } = await import('../utils/adminActivityTracker');
    await trackActivity({
      category: NOTIFICATION_CATEGORIES.USER_LOGIN,
      title: 'User Login',
      message: `${userName || email} logged in`,
      userEmail: email,
      userName: userName || email,
      metadata: {
        loginTime: new Date().toISOString(),
        userAgent: navigator.userAgent,
      },
      priority: 'low',
    });
  } catch (err) {
    console.error('[logLogin]', err);
  }
}
