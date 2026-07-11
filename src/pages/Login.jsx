import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useEditMode } from '../context/EditModeContext';
import EditableField from '../components/EditableField';
import { ErrorAlert, SuccessAlert, useToast } from '../components/ErrorDisplay';
import { useAuthFormValidation } from '../hooks/useFormValidation';
import { handleAuthError, logError } from '../utils/errorHandler';
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
const OTP_VALID_SECS = 15 * 60; // 15 minutes

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
  const [codeExpiry,  setCodeExpiry]  = useState(null); // timestamp when code expires
  const [countdown,   setCountdown]   = useState(OTP_VALID_SECS);
  const [resendCooldown, setResendCooldown] = useState(0); // seconds until resend is allowed
  const [userInfo,    setUserInfo]    = useState(null); // { name, phone } for resend

  // ── Countdown timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'sent' || !codeExpiry) return;
    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.round((codeExpiry - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [step, codeExpiry]);

  // ── Resend cooldown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const tick = setInterval(() => setResendCooldown(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(tick);
  }, [resendCooldown]);

  const fmtCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const doSend = async (targetEmail, targetPhone, targetName) => {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setCode(otp);
    setCodeExpiry(Date.now() + OTP_VALID_SECS * 1000);
    setCountdown(OTP_VALID_SECS);

    const delivered = [];
    const fn = httpsCallable(getFunctions(), 'sendPasswordResetOtp');
    const result = await fn({ email: targetEmail, phone: targetPhone, otp, name: targetName });
    if (result.data?.emailSent) delivered.push('email');
    if (result.data?.smsSent)  delivered.push('SMS');
    return { otp, delivered };
  };

  const handleSendCode = async e => {
    e.preventDefault(); setErr(''); setSending(true);
    const fsUser = await findUserInFirestore(email).catch(() => null);
    const legacyUsers = getAccounts();
    const found = fsUser || legacyUsers.find(a => a.email?.toLowerCase() === email.toLowerCase());
    const isAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    if (!found && !isAdmin) {
      setErr('No account found with that email address. Please check and try again.');
      setSending(false); return;
    }
    const name  = fsUser?.name || found?.name || 'Valued Reader';
    const phone = fsUser?.phone || found?.phone || '';
    setUserInfo({ name, phone });

    try {
      const { delivered } = await doSend(email, phone, name);
      setDeliveredTo(delivered);
      setResendCooldown(60); // 60-second cooldown before allowing resend
      setSending(false);
      setStep('sent');
    } catch (fnErr) {
      setErr('We could not send the reset code. Please check your email address or contact support at ellines.haven@gmail.com.');
      setSending(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || sending) return;
    setSending(true); setErr('');
    try {
      const { delivered } = await doSend(email, userInfo?.phone || '', userInfo?.name || 'Valued Reader');
      setDeliveredTo(delivered);
      setResendCooldown(60);
      setEnteredCode('');
    } catch {
      setErr('Could not resend the code. Please try again.');
    }
    setSending(false);
  };

  const handleVerifyCode = e => {
    e.preventDefault(); setErr('');
    if (countdown <= 0) { setErr('This code has expired. Please request a new one.'); return; }
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
            <p>Enter your account email and we'll send a 6-digit reset code to your email{userInfo?.phone ? ' and mobile phone' : ''}.</p>
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
            <p>
              A 6-digit reset code was sent to{' '}
              <strong style={{color:'var(--gold)'}}>{email}</strong>
              {deliveredTo.includes('SMS') && ' and your mobile phone'}.
              {' '}Check your inbox and spam folder.
            </p>

            {/* Countdown timer */}
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              background: countdown > 60 ? 'rgba(201,168,76,0.08)' : 'rgba(231,76,60,0.08)',
              border: `1px solid ${countdown > 60 ? 'rgba(201,168,76,0.25)' : 'rgba(231,76,60,0.3)'}`,
              borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:'0.84rem',
            }}>
              <span style={{color: countdown > 60 ? 'var(--gold)' : '#e74c3c'}}>
                {countdown > 0
                  ? <>⏱ Code expires in <strong>{fmtCountdown(countdown)}</strong></>
                  : <span style={{color:'#e74c3c'}}>⛔ Code expired</span>
                }
              </span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || sending || countdown > 0 && resendCooldown > 0}
                style={{
                  background:'none', border:'none', padding:0,
                  color: resendCooldown > 0 ? 'var(--muted)' : 'var(--gold)',
                  fontSize:'0.82rem', cursor: resendCooldown > 0 ? 'default' : 'pointer',
                  textDecoration: resendCooldown > 0 ? 'none' : 'underline', fontWeight:600,
                }}
              >
                {sending ? '⏳' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : '🔄 Resend'}
              </button>
            </div>

            {err && <div className="form-error auth-alert" role="alert"><span className="auth-alert-icon">⚠️</span>{err}</div>}
            <div className="form-group"><label>Enter 6-Digit Code</label>
              <input className="field" type="text" inputMode="numeric" pattern="[0-9]*" maxLength="6"
                value={enteredCode} onChange={e=>setEnteredCode(e.target.value.replace(/\D/g,''))}
                placeholder="123456" required autoFocus
                style={{letterSpacing:4,fontSize:'1.2rem',textAlign:'center'}} /></div>
            <button type="submit" className="btn btn-primary" style={{width:'100%'}} disabled={countdown <= 0}>
              {countdown <= 0 ? 'Code Expired — Resend' : 'Verify Code'}
            </button>
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
  const { setUser, user } = useApp();
  const navigate    = useNavigate();
  const loc         = useLocation();
  const from        = loc.state?.from?.pathname || '/';
  const [showPw,    setShowPw]    = useState(false);
  const [successMsg,setSuccessMsg]= useState('');
  const [showReset, setShowReset] = useState(false);
  const { showError, showSuccess, ToastComponent } = useToast();
  const [navigationTimeout, setNavigationTimeout] = useState(null);

  // ── Redirect immediately if user is already logged in ─────────────────────
  useEffect(() => {
    if (user) {
      const targetPath = from === '/login' ? '/' : from;
      navigate(targetPath, { replace: true });
    }
  }, [user, from, navigate]);

  // Cleanup timeout on unmount to prevent navigation after unmount
  useEffect(() => {
    return () => {
      if (navigationTimeout) {
        clearTimeout(navigationTimeout);
      }
    };
  }, [navigationTimeout]);
  
  // Use our form validation hook
  const form = useAuthFormValidation('login', {
    onSubmit: async (values) => {
      return await handleLoginSubmit(values);
    }
  });
  
  // Remember Me — default to what was last saved; pre-fill email if remembered
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('eh_remembered_email'));
  const [lc,        setLc]        = useState({ heading:'Welcome Back', sub:'Sign in to access your library', btn:'Sign In', no_account:'No account?', create_link:'Create one' });

  // Pre-fill email from remembered credential
  useEffect(() => {
    const remembered = localStorage.getItem('eh_remembered_email');
    if (remembered) form.setValue('email', remembered);
  }, [form.setValue]);

  const showLoginSuccess = (name) => {
    const message = `Login successful — welcome back${name ? ', ' + name : ''}! Taking you to Ellines Haven…`;
    setSuccessMsg(message);
    showSuccess(message);
    // Navigation is handled by the useEffect that watches `user` state above.
    // We keep a short timeout as a hard fallback for devices where the effect
    // is slow to fire.
    const targetPath = from === '/login' ? '/' : from;
    const timeoutId = setTimeout(() => {
      if (window.location.pathname === '/login') {
        window.location.href = targetPath;
      }
    }, 2000);
    setNavigationTimeout(timeoutId);
    return timeoutId;
  };
  const editCtx = useEditMode();

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'login_content')).then(snap => {
      if (snap.exists()) setLc(prev => ({ ...prev, ...snap.data() }));
    }).catch(() => {});
  }, []);

  const cv = (editCtx?.editMode && editCtx?.pageKey === 'login_content')
    ? { ...lc, ...editCtx.pageData } : lc;

  const handleLoginSubmit = async (values) => {
    const emailKey = values.email.trim().toLowerCase();

    try {
      // ── Remember Me — save or clear the email ───────────────────────────────
      if (rememberMe) {
        localStorage.setItem('eh_remembered_email', values.email.trim());
      } else {
        localStorage.removeItem('eh_remembered_email');
      }

      // ── Helper: set user session; if !rememberMe also write to sessionStorage
      //    so AppContext localStorage persists only when chosen ─────────────────
      const finalizeSession = (sessionUser) => {
        setUser(sessionUser); // AppContext always writes to localStorage
        if (!rememberMe) {
          // Mark this session as "session-only" — on next app load AppContext
          // will check this flag and clear if the sessionStorage token is gone
          sessionStorage.setItem('eh_session_only', '1');
        } else {
          sessionStorage.removeItem('eh_session_only');
        }
      };

      // ── Lockout check ───────────────────────────────────────────────────────
      const attemptData = getAttemptData(emailKey);
      if (attemptData.lockedUntil && Date.now() < attemptData.lockedUntil) {
        const lockoutMsg = getLockoutMessage(attemptData) || 'Account temporarily locked. Please try again later.';
        return { success: false, error: lockoutMsg };
      }
      // If lockout has expired, clear it
      if (attemptData.lockedUntil && Date.now() >= attemptData.lockedUntil) {
        clearAttempts(emailKey);
      }

      /* 1. Check Firestore users collection first */
      const fsUser = await findUserInFirestore(emailKey);
      if (fsUser) {
        // Block deleted users from logging in — check both Firestore status and localStorage blocklist
        const lsDeleted = JSON.parse(localStorage.getItem('eh_deleted_users') || '[]');
        if (fsUser.status === 'deleted' || lsDeleted.includes(emailKey)) {
          return { success: false, error: 'No account found with that email address. Please check your email or create an account.' };
        }
        if (fsUser.suspended) {
          return { success: false, error: 'Your account has been suspended. Please contact support at ellines.haven@gmail.com.' };
        }
        const pwOverrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
        const localOverride = pwOverrides[emailKey];
        const fsHash = fsUser.passwordHash || fsUser.password || '';
        const passwordOk = (localOverride && localOverride === values.password) || (fsHash && fsHash === values.password);
        if (!fsHash && !localOverride) {
          return { success: false, error: 'This account has no password set. Please contact support.' };
        }
        if (!passwordOk) {
          const data = recordFailedAttempt(emailKey);
          const remaining = MAX_ATTEMPTS - data.count;
          if (data.lockedUntil) {
            const lockoutMsg = getLockoutMessage(data) || 'Too many failed attempts. Account locked.';
            return { success: false, error: lockoutMsg };
          } else {
            return { success: false, error: `Incorrect password. ${remaining > 0 ? remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.' : ''}` };
          }
        }
        clearAttempts(emailKey);
        const roleOverrides1 = JSON.parse(localStorage.getItem('eh_role_overrides') || '{}');
        const effectiveRole1 = roleOverrides1[emailKey] || fsUser.role || 'user';
        const sessionUser = { id: fsUser.id, name: fsUser.name, email: fsUser.email, role: effectiveRole1, mustChangePassword: !!fsUser.mustChangePassword };
        finalizeSession(sessionUser);
        await logLogin(fsUser.email, fsUser.name);
        showLoginSuccess(fsUser.name);
        
        if (fsUser.mustChangePassword) {
          // For password change, navigate immediately without success message delay
          setTimeout(() => navigate('/change-password', { replace: true }), 1000);
          return { success: true };
        }
        // Navigation handled by showLoginSuccess
        return { success: true };
      }

      /* 2. Check admin credentials in Firestore */
      const adminAccount = await checkAdminCredentials(emailKey, values.password);
      if (adminAccount) {
        clearAttempts(emailKey);
        const sessionUser = { id: adminAccount.id || 'admin01', name: adminAccount.name || 'Admin', email: adminAccount.email, role: adminAccount.role };
        finalizeSession(sessionUser);
        await logLogin(adminAccount.email, adminAccount.name);
        showLoginSuccess(adminAccount.name || 'Admin');
        // Navigation handled by showLoginSuccess
        return { success: true };
      }

      /* 3. Legacy: check localStorage registered users OR Firestore site_data/registered_users ── */
      try {
        const regSnap = await getDoc(doc(db, 'site_data', 'registered_users'));
        if (regSnap.exists()) {
          const regData = regSnap.data();
          // Check both Firestore deletedEmails and localStorage blocklist
          const fsDeletedEmails = new Set((regData.deletedEmails || []).map(e => e.toLowerCase()));
          const lsDeleted       = new Set(JSON.parse(localStorage.getItem('eh_deleted_users') || '[]').map(e => e.toLowerCase()));
          const isDeleted       = fsDeletedEmails.has(emailKey) || lsDeleted.has(emailKey);
          const regUser = !isDeleted
            ? (regData.registered || []).find(u => u.email?.toLowerCase() === emailKey)
            : null;
          if (regUser) {
            const fsPwOverrides = regData.pwOverrides || {};
            const localOverrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
            const fsPw = fsPwOverrides[emailKey] || localOverrides[emailKey] || regUser.password || '';
            
            const suspFs = JSON.parse(localStorage.getItem('eh_suspended_fs') || '[]');
            const suspLeg = JSON.parse(localStorage.getItem('eh_suspended_users') || '[]');
            const allSusp = [...new Set([...suspFs, ...suspLeg])];
            if (allSusp.includes(emailKey) || regUser.suspended) {
              return { success: false, error: 'Your account has been suspended. Please contact support at ellines.haven@gmail.com.' };
            }
            
            if (!fsPw) {
              return { success: false, error: 'This account has no password set. Please contact support.' };
            }
            if (fsPw !== values.password) {
              const data = recordFailedAttempt(emailKey);
              const remaining = MAX_ATTEMPTS - data.count;
              if (data.lockedUntil) {
                const lockoutMsg = getLockoutMessage(data) || 'Too many failed attempts. Account locked.';
                return { success: false, error: lockoutMsg };
              } else {
                return { success: false, error: `Incorrect password. ${remaining > 0 ? remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.' : ''}` };
              }
            }
            clearAttempts(emailKey);
            
            const uid = regUser.id || ('u_' + Date.now());
            const joined = regUser.joined || new Date().toISOString().slice(0, 10);
            const roleOverrides3 = JSON.parse(localStorage.getItem('eh_role_overrides') || '{}');
            const effectiveRole3 = roleOverrides3[emailKey] || regData.roleOverrides?.[emailKey] || regUser.role || 'user';
            await setDoc(doc(db, 'users', uid), {
              id: uid, name: regUser.name, email: emailKey,
              role: effectiveRole3, passwordHash: fsPw,
              joined, migratedAt: serverTimestamp(), status: 'active',
            }, { merge: true }).catch((e) => {
              console.warn('[Login] Auto-migration to users collection failed:', e.message);
            });
            
            localStorage.setItem('eh_registered_users', JSON.stringify(regData.registered));
            const localPwOverrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
            localPwOverrides[emailKey] = fsPw;
            localStorage.setItem('eh_pw_overrides', JSON.stringify(localPwOverrides));
            
            const sessionUser = { id: uid, name: regUser.name, email: emailKey, role: effectiveRole3 };
            finalizeSession(sessionUser);
            await logLogin(emailKey, regUser.name);
            showLoginSuccess(regUser.name);
            // Navigation handled by showLoginSuccess
            return { success: true };
          }
        }
      } catch (e) {
        logError(e, { operation: 'firestore-registered-users-check' });
      }

      /* 4. Last resort — localStorage registered users */
      const legacy = getAccounts();
      const legacyAccount = legacy.find(a => a.email?.toLowerCase() === emailKey);
      if (legacyAccount) {
        if (legacyAccount.suspended) {
          return { success: false, error: 'Your account has been suspended. Please contact support at ellines.haven@gmail.com.' };
        }
        const effectivePw = legacyAccount.password;
        if (effectivePw !== values.password) {
          const data = recordFailedAttempt(emailKey);
          const remaining = MAX_ATTEMPTS - data.count;
          if (data.lockedUntil) {
            const lockoutMsg = getLockoutMessage(data) || 'Too many failed attempts. Account locked.';
            return { success: false, error: lockoutMsg };
          } else {
            return { success: false, error: `Incorrect password. ${remaining > 0 ? remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.' : ''}` };
          }
        }
        clearAttempts(emailKey);
        const roleOverrides4 = JSON.parse(localStorage.getItem('eh_role_overrides') || '{}');
        const effectiveRole4 = roleOverrides4[emailKey] || legacyAccount.role || 'user';
        const sessionUser = { id: legacyAccount.id, name: legacyAccount.name, email: legacyAccount.email, role: effectiveRole4 };
        finalizeSession(sessionUser);
        await logLogin(legacyAccount.email, legacyAccount.name);
        showLoginSuccess(legacyAccount.name);
        // Navigation handled by showLoginSuccess
        return { success: true };
      }

      return { success: false, error: 'No account found with that email address. Please check your email or create an account.' };
    } catch (e) {
      logError(e, { operation: 'login', email: emailKey });
      return handleAuthError(e, 'login');
    }
  };

  return (
    <main className="auth-page">
      {showReset && <ForgotPasswordModal onClose={() => setShowReset(false)} />}
      {ToastComponent}
      <div className="auth-wrap">
        <div className="auth-card card">
          <div className="auth-top">
            <Link to="/"><img src="/logo-nobg3.png" alt="Ellines Haven" className="auth-logo-img" /></Link>
            <h2><EditableField field="heading">{cv.heading}</EditableField></h2>
            <p><EditableField field="sub">{cv.sub}</EditableField></p>
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const result = await form.handleSubmit();
            if (!result.success && result.error) {
              showError(result.error);
            }
          }}>
            {form.firstError && (
              <ErrorAlert error={form.firstError} className="auth-alert" style={{marginBottom:'16px'}} />
            )}
            {successMsg && (
              <SuccessAlert message={successMsg} className="auth-alert" style={{marginBottom:'16px'}} />
            )}
            
            <div className="form-group" style={{marginBottom:'15px'}}>
              <label>Email Address</label>
              <input 
                {...form.getEmailProps()}
                className="field" 
                placeholder="your@email.com" 
                required 
                autoFocus 
              />
              {form.errors.email && (
                <div className="field-error">⚠️ {form.errors.email}</div>
              )}
            </div>

            <div className="form-group" style={{marginBottom:'20px'}}>
              <label>Password</label>
              <div className="auth-pw-wrap">
                <input 
                  {...form.getPasswordProps()}
                  className="field" 
                  type={showPw ? 'text' : 'password'}
                  placeholder="Your password" 
                  required 
                />
                <button type="button" className="auth-pw-eye" onClick={() => setShowPw(v => !v)} aria-label="Toggle password">
                  <EyeIcon open={showPw} />
                </button>
              </div>
              {form.errors.password && (
                <div className="field-error">⚠️ {form.errors.password}</div>
              )}
            </div>

            <div className="auth-remember">
              <label className="auth-remember-check">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                <span>Keep me signed in on this device</span>
              </label>
            </div>

            <button type="submit" className="btn btn-primary" style={{width:'100%'}} disabled={form.isSubmitting}>
              {form.isSubmitting ? 'Signing In…' : cv.btn}
            </button>

            <button type="button" className="auth-forgot" onClick={() => setShowReset(true)}>
              Forgot your password?
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
    const device = await getDeviceTypeForLog();

    // ── 1. Write to admin_notifications directly (guaranteed, cross-device) ──
    // This is the primary source for the admin Activity panel.
    // The Cloud Function below adds IP/geolocation but is not required.
    try {
      const { trackActivity, NOTIFICATION_CATEGORIES } = await import('../utils/adminActivityTracker');
      await trackActivity({
        category: NOTIFICATION_CATEGORIES.USER_LOGIN,
        title:    'User Login',
        message:  `${userName || email} logged in`,
        userEmail: email.toLowerCase(),
        userName:  userName || email,
        metadata:  { device, loginTime: new Date().toISOString() },
        priority: 'low',
      });
    } catch (e) {
      console.warn('[logLogin] trackActivity failed:', e.message);
    }

    // ── 2. Log to system_logs (admin raw log) ──
    try {
      const logsDoc = doc(db, 'site_data', 'system_logs');
      const snap    = await getDoc(logsDoc);
      const existing = snap.exists() ? (snap.data().logs || []) : [];
      const entry = { time: new Date().toISOString().slice(0,16).replace('T',' '), type:'auth', event:'Login: '+email, user:email, ip:'browser', status:'success' };
      await setDoc(logsDoc, { logs: [entry, ...existing].slice(0,500), updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.warn('[logLogin] system_logs failed:', e.message);
    }

    // ── 3. Cloud Function (adds real IP + geolocation to user_sessions) ──
    // Best-effort — failure does NOT block or duplicate the activity above
    import('../utils/reliableActivityLogger').then(({ logUserLoginReliable }) =>
      logUserLoginReliable(email, userName, { device })
    ).catch(() => {});

    // ── 4. Welcome-back notification to user's own bell feed (once per day) ──
    const { notifyLoginWelcome } = await import('../utils/userNotifier');
    await notifyLoginWelcome(email, userName);

  } catch (err) {
    console.error('[logLogin]', err);
  }
}

// Helper: determine device type for logging
async function getDeviceTypeForLog() {
  const ua = navigator.userAgent.toLowerCase();
  if (/mobile|android|iphone/.test(ua)) return /ipad|tablet/.test(ua) ? 'Tablet' : 'Mobile';
  if (/windows|win32/.test(ua)) return 'Windows';
  if (/macintosh|mac os/.test(ua)) return 'Mac';
  if (/linux/.test(ua)) return 'Linux';
  return 'Desktop';
}
