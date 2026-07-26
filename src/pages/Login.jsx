import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useEditMode } from '../context/EditModeContext';
import EditableField from '../components/EditableField';
import { ErrorAlert, SuccessAlert, useToast } from '../components/ErrorDisplay';
import { useAuthFormValidation } from '../hooks/useFormValidation';
import { handleAuthError, logError, getErrorMessage } from '../utils/errorHandler';
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { usePageMeta } from '../hooks/usePageMeta';
import { verifyPassword, storePasswordValue } from '../utils/passwordSecurity';
import {
  getSecuritySettings,
  shouldRequire2FA,
  sendLoginOtp,
  verifyLoginOtp,
  sendPasswordResetOtpServer,
} from '../utils/twoFactorAuth';
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
    const emailKey = email.toLowerCase();
    const snap = await getDoc(doc(db, 'site_data', 'admin_credentials'));
    const data = snap.exists() ? (snap.data() || {}) : null;
    const admins = data?.accounts || [];

    // Existing admin account: verify password only — never overwrite on failure
    const byEmail = admins.find(a => (a.email || '').toLowerCase() === emailKey);
    if (byEmail) {
      const pwMap = data.pwOverrides || {};
      let localOverride = '';
      try { localOverride = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}')[emailKey] || ''; } catch { /* ignore */ }
      const stored = pwMap[emailKey] || localOverride || byEmail.password || '';
      if (!stored) return null;
      const check = await verifyPassword(password, stored);
      if (!check.ok) return null;
      if (check.needsUpgrade) {
        const hashed = await storePasswordValue(password);
        const nextAccounts = admins.map(a =>
          (a.email || '').toLowerCase() === emailKey ? { ...a, password: hashed } : a
        );
        await setDoc(doc(db, 'site_data', 'admin_credentials'), {
          accounts: nextAccounts,
          pwOverrides: { ...pwMap, [emailKey]: hashed },
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      return byEmail;
    }

    // First-run seed only: no accounts exist yet, and email is the super admin
    if (admins.length === 0 && emailKey === SUPER_ADMIN_EMAIL.toLowerCase()) {
      const hashed = await storePasswordValue(password);
      const bootstrapEntry = {
        email: SUPER_ADMIN_EMAIL,
        role: 'superadmin',
        name: 'Admin',
        id: 'admin01',
        password: hashed,
      };
      await setDoc(doc(db, 'site_data', 'admin_credentials'), {
        accounts: [bootstrapEntry],
        pwOverrides: { [emailKey]: hashed },
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
    setCodeExpiry(Date.now() + OTP_VALID_SECS * 1000);
    setCountdown(OTP_VALID_SECS);

    const delivered = [];
    const result = await sendPasswordResetOtpServer({
      email: targetEmail,
      phone: targetPhone,
      name: targetName,
    });
    if (result?.emailSent) delivered.push('email');
    if (result?.smsSent) delivered.push('SMS');
    return { delivered };
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

  const handleVerifyCode = async e => {
    e.preventDefault(); setErr('');
    if (countdown <= 0) { setErr('This code has expired. Please request a new one.'); return; }
    setSending(true);
    try {
      await verifyLoginOtp({ email, otp: enteredCode, purpose: 'reset' });
      setStep('reset');
    } catch (err) {
      setErr(err?.message || 'That code is incorrect. Please check and try again.');
    }
    setSending(false);
  };

  const handleReset = async e => {
    e.preventDefault(); setErr('');
    if (newPw.length < 6) { setErr('Your password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setErr('Passwords do not match. Please re-enter.'); return; }
    const hashed = await storePasswordValue(newPw);
    const emailKey = email.toLowerCase();
    const overrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
    overrides[emailKey] = hashed;
    localStorage.setItem('eh_pw_overrides', JSON.stringify(overrides));
    try {
      const fsUser = await findUserInFirestore(email);
      if (fsUser) await setDoc(doc(db, 'users', fsUser.id), { passwordHash: hashed, updatedAt: serverTimestamp() }, { merge: true });
    } catch {}
    // Super-admin / admin_credentials path (login ignores users.passwordHash for this account)
    try {
      const snap = await getDoc(doc(db, 'site_data', 'admin_credentials'));
      if (snap.exists()) {
        const data = snap.data() || {};
        const admins = data.accounts || [];
        const idx = admins.findIndex(a => (a.email || '').toLowerCase() === emailKey);
        if (idx >= 0 || emailKey === SUPER_ADMIN_EMAIL.toLowerCase()) {
          const nextAccounts = idx >= 0
            ? admins.map((a, i) => (i === idx ? { ...a, password: hashed } : a))
            : [...admins, {
                email: SUPER_ADMIN_EMAIL,
                role: 'superadmin',
                name: 'Admin',
                id: 'admin01',
                password: hashed,
              }];
          await setDoc(doc(db, 'site_data', 'admin_credentials'), {
            accounts: nextAccounts,
            pwOverrides: { ...(data.pwOverrides || {}), [emailKey]: hashed },
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
      }
    } catch {}
    clearAttempts(emailKey);
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
            <div className={`auth-otp-timer${countdown <= 60 ? ' is-urgent' : ''}`}>
              <span className="auth-otp-timer-label">
                {countdown > 0
                  ? <>⏱ Code expires in <strong>{fmtCountdown(countdown)}</strong></>
                  : <>⛔ Code expired</>
                }
              </span>
              <button
                type="button"
                className="auth-resend-btn"
                onClick={handleResend}
                disabled={resendCooldown > 0 || sending || countdown > 0 && resendCooldown > 0}
              >
                {sending ? '⏳' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : '🔄 Resend'}
              </button>
            </div>

            {err && <div className="form-error auth-alert" role="alert"><span className="auth-alert-icon">⚠️</span>{err}</div>}
            <div className="form-group"><label>Enter 6-Digit Code</label>
              <input className="field auth-otp-input" type="text" inputMode="numeric" pattern="[0-9]*" maxLength="6"
                value={enteredCode} onChange={e=>setEnteredCode(e.target.value.replace(/\D/g,''))}
                placeholder="123456" required autoFocus /></div>
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
  
  usePageMeta({
    title: 'Sign In',
    description: 'Sign in to Ellines Haven to access your library, orders, and reading history — your books, always available.',
  });

  const loc         = useLocation();
  const navigate    = useNavigate();
  const [showPw,    setShowPw]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg,setSuccessMsg]= useState('');
  const [showReset, setShowReset] = useState(false);
  const [pending2FA, setPending2FA] = useState(null); // { sessionUser, phone, emailKey }
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpErr, setOtpErr] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const { showError, showSuccess, ToastComponent } = useToast();

  // Remember Me state — only pre-checks if user explicitly saved it before
  const rememberedEmail = localStorage.getItem('eh_remembered_email') || '';
  const [rememberMe, setRememberMe] = useState(!!rememberedEmail);
  const [lc, setLc] = useState({ heading:'Welcome Back', sub:'Sign in to access your library', btn:'Sign In', no_account:'No account?', create_link:'Create one' });

  // ── Block render if already logged in — no flash, instant redirect ─────────
  // (after hooks so Rules of Hooks stay valid)
  useEffect(() => {
    if (!user || pending2FA) return;
    const raw = loc.state?.from?.pathname;
    const safe = raw && raw !== '/login' && raw !== '/register' ? raw : '/';
    window.location.replace(safe);
  }, [user, pending2FA, loc.state]);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setInterval(() => setOtpCountdown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [otpCountdown]);

  // Use our form validation hook — onSubmit is NOT passed here to avoid
  // a stale-closure ReferenceError (handleLoginSubmit is defined below).
  // Submission is handled directly in the form's onSubmit handler instead.
  const form = useAuthFormValidation('login', {});

  // Pre-fill email from remembered credential — only on first mount
  useEffect(() => {
    if (rememberedEmail) form.setValue('email', rememberedEmail);
  }, []); // eslint-disable-line

  const showLoginSuccess = (name) => {
    const message = `Welcome back${name ? ', ' + name : ''}! Taking you in…`;
    setSuccessMsg(message);
    showSuccess(message);
    const raw = loc.state?.from?.pathname;
    const targetPath = raw && raw !== '/login' && raw !== '/register' ? raw : '/';
    setTimeout(() => window.location.replace(targetPath), 600);
  };

  const editCtx = useEditMode();

  useEffect(() => {
    getDoc(doc(db, 'site_data', 'login_content')).then(snap => {
      if (snap.exists()) setLc(prev => ({ ...prev, ...snap.data() }));
    }).catch(err => {
      console.warn('[Login] Failed to load login content:', err.message);
      // Silently fail — use default content if Firestore is down
    });
  }, []);

  const cv = (editCtx?.editMode && editCtx?.pageKey === 'login_content')
    ? { ...lc, ...editCtx.pageData } : lc;

  const failPw = (emailKey) => {
    const data = recordFailedAttempt(emailKey);
    const remaining = MAX_ATTEMPTS - data.count;
    if (data.lockedUntil) {
      return { success: false, error: getLockoutMessage(data) || 'Too many failed attempts. Account locked.' };
    }
    return {
      success: false,
      error: `Incorrect password. ${remaining > 0 ? remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.' : ''}`,
    };
  };

  const upgradeStoredPassword = async (emailKey, userId, plaintext) => {
    try {
      const hashed = await storePasswordValue(plaintext);
      if (userId) {
        await setDoc(doc(db, 'users', userId), { passwordHash: hashed, updatedAt: serverTimestamp() }, { merge: true });
      }
      const overrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
      overrides[emailKey] = hashed;
      localStorage.setItem('eh_pw_overrides', JSON.stringify(overrides));
    } catch (e) {
      console.warn('[Login] Password upgrade skipped:', e.message);
    }
  };

  const finishAuthenticatedLogin = async (sessionUser, extras = {}) => {
    const finalizeSession = (u) => {
      setUser(u);
      // Persist "session-only" in localStorage so browser restart can clear the session
      if (!rememberMe) {
        localStorage.setItem('eh_session_only', '1');
        sessionStorage.setItem('eh_session_alive', '1');
      } else {
        localStorage.removeItem('eh_session_only');
        sessionStorage.removeItem('eh_session_only');
      }
    };

    let security = {};
    try {
      security = await getSecuritySettings();
    } catch (e) {
      console.warn('[Login] Security settings unavailable, continuing without 2FA gate:', e?.message);
    }

    const accountFor2FA = {
      ...sessionUser,
      twoFactorEnabled: extras.twoFactorEnabled === true || sessionUser.twoFactorEnabled === true,
    };

    if (shouldRequire2FA(accountFor2FA, security)) {
      try {
        await sendLoginOtp({
          email: sessionUser.email,
          name: sessionUser.name,
          phone: extras.phone || '',
        });
        setPending2FA({
          sessionUser: { ...sessionUser, twoFactorEnabled: true },
          emailKey: String(sessionUser.email).toLowerCase(),
          mustChangePassword: !!extras.mustChangePassword,
        });
        setOtpCode('');
        setOtpErr('');
        setOtpCountdown(OTP_VALID_SECS);
        return { success: true, requires2FA: true };
      } catch (e) {
        return {
          success: false,
          error: getErrorMessage(e) || 'Could not send your 2FA code. Please try again or contact support.',
        };
      }
    }

    finalizeSession(sessionUser);
    try {
      await logLogin(sessionUser.email, sessionUser.name);
    } catch (e) {
      console.warn('[Login] Activity log skipped:', e?.message);
    }
    if (extras.mustChangePassword) {
      showLoginSuccess(sessionUser.name);
      setTimeout(() => navigate('/change-password', { replace: true }), 1000);
      return { success: true };
    }
    showLoginSuccess(sessionUser.name);
    return { success: true };
  };

  const handleVerifyLoginOtp = async (e) => {
    e.preventDefault();
    if (!pending2FA) return;
    setOtpErr('');
    if (otpCountdown <= 0) {
      setOtpErr('This code has expired. Please request a new one.');
      return;
    }
    setOtpBusy(true);
    try {
      await verifyLoginOtp({ email: pending2FA.emailKey, otp: otpCode, purpose: 'login' });
      const sessionUser = pending2FA.sessionUser;
      setUser(sessionUser);
      if (!rememberMe) {
        localStorage.setItem('eh_session_only', '1');
        sessionStorage.setItem('eh_session_alive', '1');
      } else {
        localStorage.removeItem('eh_session_only');
        sessionStorage.removeItem('eh_session_only');
      }
      await logLogin(sessionUser.email, sessionUser.name);
      const mustChange = pending2FA.mustChangePassword;
      setPending2FA(null);
      if (mustChange) {
        showLoginSuccess(sessionUser.name);
        setTimeout(() => navigate('/change-password', { replace: true }), 1000);
      } else {
        showLoginSuccess(sessionUser.name);
      }
    } catch (err) {
      const raw = err?.message || 'Incorrect verification code.';
      setOtpErr(raw.replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/, '').trim());
    }
    setOtpBusy(false);
  };

  const handleResendLoginOtp = async () => {
    if (!pending2FA || otpCountdown > OTP_VALID_SECS - 60) return;
    setOtpBusy(true);
    setOtpErr('');
    try {
      await sendLoginOtp({
        email: pending2FA.emailKey,
        name: pending2FA.sessionUser.name,
      });
      setOtpCountdown(OTP_VALID_SECS);
      setOtpCode('');
    } catch (err) {
      setOtpErr(err?.message || 'Could not resend the code.');
    }
    setOtpBusy(false);
  };

  const handleLoginSubmit = async (values) => {
    const emailKey = values.email.trim().toLowerCase();

    try {
      if (rememberMe) localStorage.setItem('eh_remembered_email', values.email.trim());
      else localStorage.removeItem('eh_remembered_email');

      const attemptData = getAttemptData(emailKey);
      if (attemptData.lockedUntil && Date.now() < attemptData.lockedUntil) {
        return { success: false, error: getLockoutMessage(attemptData) || 'Account temporarily locked. Please try again later.' };
      }
      if (attemptData.lockedUntil && Date.now() >= attemptData.lockedUntil) clearAttempts(emailKey);

      const fsUser = await findUserInFirestore(emailKey);
      if (fsUser) {
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
        if (!fsHash && !localOverride) {
          return { success: false, error: 'This account has no password set. Please contact support.' };
        }
        const primary = await verifyPassword(values.password, fsHash);
        const overrideCheck = localOverride
          ? await verifyPassword(values.password, localOverride)
          : { ok: false, needsUpgrade: false };
        if (!primary.ok && !overrideCheck.ok) return failPw(emailKey);

        clearAttempts(emailKey);
        if (primary.needsUpgrade || overrideCheck.needsUpgrade) {
          await upgradeStoredPassword(emailKey, fsUser.id, values.password);
        }
        const roleOverrides1 = JSON.parse(localStorage.getItem('eh_role_overrides') || '{}');
        const effectiveRole1 = roleOverrides1[emailKey] || fsUser.role || 'user';
        return finishAuthenticatedLogin(
          {
            id: fsUser.id,
            name: fsUser.name,
            email: fsUser.email,
            role: effectiveRole1,
            mustChangePassword: !!fsUser.mustChangePassword,
            twoFactorEnabled: !!fsUser.twoFactorEnabled,
          },
          { phone: fsUser.phone || '', mustChangePassword: !!fsUser.mustChangePassword, twoFactorEnabled: !!fsUser.twoFactorEnabled }
        );
      }

      const adminAccount = await checkAdminCredentials(emailKey, values.password);
      if (adminAccount) {
        clearAttempts(emailKey);
        return finishAuthenticatedLogin(
          {
            id: adminAccount.id || 'admin01',
            name: adminAccount.name || 'Admin',
            email: adminAccount.email,
            role: adminAccount.role,
            twoFactorEnabled: !!adminAccount.twoFactorEnabled,
          },
          { twoFactorEnabled: !!adminAccount.twoFactorEnabled }
        );
      }

      try {
        const regSnap = await getDoc(doc(db, 'site_data', 'registered_users'));
        if (regSnap.exists()) {
          const regData = regSnap.data();
          const fsDeletedEmails = new Set((regData.deletedEmails || []).map(e => e.toLowerCase()));
          const lsDeleted = new Set(JSON.parse(localStorage.getItem('eh_deleted_users') || '[]').map(e => e.toLowerCase()));
          const isDeleted = fsDeletedEmails.has(emailKey) || lsDeleted.has(emailKey);
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
            if (!fsPw) return { success: false, error: 'This account has no password set. Please contact support.' };
            const check = await verifyPassword(values.password, fsPw);
            if (!check.ok) return failPw(emailKey);
            clearAttempts(emailKey);

            const uid = regUser.id || ('u_' + Date.now());
            const joined = regUser.joined || new Date().toISOString().slice(0, 10);
            const roleOverrides3 = JSON.parse(localStorage.getItem('eh_role_overrides') || '{}');
            const effectiveRole3 = roleOverrides3[emailKey] || regData.roleOverrides?.[emailKey] || regUser.role || 'user';
            const hashed = check.needsUpgrade ? await storePasswordValue(values.password) : fsPw;
            await setDoc(doc(db, 'users', uid), {
              id: uid, name: regUser.name, email: emailKey,
              role: effectiveRole3, passwordHash: hashed,
              twoFactorEnabled: !!regUser.twoFactorEnabled,
              joined, migratedAt: serverTimestamp(), status: 'active',
            }, { merge: true }).catch((e) => {
              console.warn('[Login] Auto-migration to users collection failed:', e.message);
            });

            const loginDeletedSet = new Set([
              ...(regData.deletedEmails || []),
              ...JSON.parse(localStorage.getItem('eh_deleted_users') || '[]'),
            ].map(e => String(e).toLowerCase()));
            localStorage.setItem('eh_registered_users', JSON.stringify(
              (regData.registered || []).filter(r => !loginDeletedSet.has((r.email || '').toLowerCase()))
            ));
            const localPwOverrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
            localPwOverrides[emailKey] = hashed;
            localStorage.setItem('eh_pw_overrides', JSON.stringify(localPwOverrides));

            return finishAuthenticatedLogin(
              { id: uid, name: regUser.name, email: emailKey, role: effectiveRole3, twoFactorEnabled: !!regUser.twoFactorEnabled },
              { twoFactorEnabled: !!regUser.twoFactorEnabled }
            );
          }
        }
      } catch (e) {
        logError(e, { operation: 'firestore-registered-users-check' });
      }

      const legacy = getAccounts();
      const legacyAccount = legacy.find(a => a.email?.toLowerCase() === emailKey);
      if (legacyAccount) {
        if (legacyAccount.suspended) {
          return { success: false, error: 'Your account has been suspended. Please contact support at ellines.haven@gmail.com.' };
        }
        const check = await verifyPassword(values.password, legacyAccount.password);
        if (!check.ok) return failPw(emailKey);
        clearAttempts(emailKey);
        if (check.needsUpgrade) await upgradeStoredPassword(emailKey, legacyAccount.id, values.password);
        const roleOverrides4 = JSON.parse(localStorage.getItem('eh_role_overrides') || '{}');
        const effectiveRole4 = roleOverrides4[emailKey] || legacyAccount.role || 'user';
        return finishAuthenticatedLogin(
          { id: legacyAccount.id, name: legacyAccount.name, email: legacyAccount.email, role: effectiveRole4, twoFactorEnabled: !!legacyAccount.twoFactorEnabled },
          { twoFactorEnabled: !!legacyAccount.twoFactorEnabled }
        );
      }

      return { success: false, error: 'No account found with that email address. Please check your email or create an account.' };
    } catch (e) {
      // handleAuthError already logs — avoid duplicate MEDIUM SEVERITY console noise
      return handleAuthError(e, 'login');
    }
  };

  if (user && !pending2FA) return null;

  return (
    <main className="auth-page">
      {showReset && <ForgotPasswordModal onClose={() => setShowReset(false)} />}
      {ToastComponent}
      <div className="auth-wrap">
        <div className="auth-card card">
          <div className="auth-top">
            <Link to="/" className="auth-logo-link" aria-label="Ellines Haven home">
              <img src="/logo-nobg3.png" alt="" className="auth-logo-img" />
            </Link>
            <p className="auth-brand">Ellines Haven</p>
            <hr className="auth-brand-rule" />
            {pending2FA ? (
              <>
                <h2>Two-Factor Verification</h2>
                <p>Enter the 6-digit code we sent to <strong>{pending2FA.emailKey}</strong></p>
              </>
            ) : (
              <>
                <h2><EditableField field="heading">{cv.heading}</EditableField></h2>
                <p><EditableField field="sub">{cv.sub}</EditableField></p>
              </>
            )}
          </div>

          {pending2FA ? (
            <form onSubmit={handleVerifyLoginOtp}>
              {otpErr && <ErrorAlert error={otpErr} className="auth-alert" style={{ marginBottom: '16px' }} />}
              <div className="form-group">
                <label>Verification Code</label>
                <input
                  className="field auth-otp-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  required
                  autoComplete="one-time-code"
                />
                <div className={`auth-otp-timer${otpCountdown <= 60 ? ' is-urgent' : ''}`} style={{ marginTop: 8 }}>
                  <span className="auth-otp-timer-label">
                    {otpCountdown > 0
                      ? `Code expires in ${Math.floor(otpCountdown / 60)}:${String(otpCountdown % 60).padStart(2, '0')}`
                      : 'Code expired'}
                  </span>
                </div>
              </div>
              <button type="submit" className="btn btn-primary auth-submit-btn" disabled={otpBusy || otpCode.length !== 6}>
                {otpBusy ? <><span className="auth-spinner" />Verifying…</> : 'Verify & Sign In'}
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 12 }}>
                <button
                  type="button"
                  className="auth-forgot-link"
                  disabled={otpBusy || otpCountdown > OTP_VALID_SECS - 60}
                  onClick={handleResendLoginOtp}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="auth-forgot-link"
                  onClick={() => { setPending2FA(null); setOtpCode(''); setOtpErr(''); }}
                >
                  ← Back to sign in
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            try {
              // Call handleLoginSubmit directly with current field values
              // to avoid stale-closure issues with the hook's onSubmit callback.
              const result = await handleLoginSubmit({
                email: form.values.email,
                password: form.values.password,
              });
              if (result && !result.success && result.error) {
                // result.error may be a string or an object from handleAuthError
                const msg = typeof result.error === 'string'
                  ? result.error
                  : (result.error?.message || getErrorMessage(result.error) || 'Sign-in failed. Please try again.');
                showError(msg);
              }
            } catch (e) {
              showError(getErrorMessage(e) || 'Sign-in failed. Please try again.');
            } finally {
              setSubmitting(false);
            }
          }}>
            {form.firstError && (
              <ErrorAlert error={form.firstError} className="auth-alert" style={{marginBottom:'16px'}} />
            )}
            {successMsg && (
              <SuccessAlert message={successMsg} className="auth-alert" style={{marginBottom:'16px'}} />
            )}

            <div className="form-group">
              <label>Email Address</label>
              <input
                {...form.getEmailProps()}
                className={`field${form.errors.email ? ' field--error' : ''}`}
                placeholder="your@email.com"
                required
                autoFocus
                autoComplete="email"
              />
              {form.errors.email && <div className="field-error">⚠️ {form.errors.email}</div>}
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="auth-pw-wrap">
                <input
                  {...form.getPasswordProps()}
                  className={`field${form.errors.password ? ' field--error' : ''}`}
                  type={showPw ? 'text' : 'password'}
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                />
                <button type="button" className="auth-pw-eye" onClick={() => setShowPw(v => !v)} aria-label="Toggle password visibility">
                  <EyeIcon open={showPw} />
                </button>
              </div>
              {form.errors.password && <div className="field-error">⚠️ {form.errors.password}</div>}
            </div>

            <div className="auth-remember-row">
              <label className="auth-remember-label">
                <input
                  type="checkbox"
                  className="auth-remember-checkbox"
                  checked={rememberMe}
                  onChange={e => {
                    setRememberMe(e.target.checked);
                    // If unchecking, clear any saved email so a different user can log in freely
                    if (!e.target.checked) {
                      localStorage.removeItem('eh_remembered_email');
                    }
                  }}
                />
                <span>Keep me signed in on this device</span>
              </label>
              <button type="button" className="auth-forgot-link" onClick={() => setShowReset(true)}>
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-primary auth-submit-btn"
              disabled={submitting}
            >
              {submitting
                ? <><span className="auth-spinner" />Signing In…</>
                : <EditableField field="btn">{cv.btn}</EditableField>
              }
            </button>
          </form>
          )}

          {!pending2FA && (
          <p className="auth-switch">
            <EditableField field="no_account">{cv.no_account}</EditableField>{' '}
            <Link to="/register"><EditableField field="create_link">{cv.create_link}</EditableField></Link>
          </p>
          )}
        </div>
      </div>
    </main>
  );
}

async function logLogin(email, userName) {
  try {
    const device = await getDeviceTypeForLog();
    const SUPER_ADMIN_EMAIL = 'ellines.haven@gmail.com';
    const isSuper = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

    // ── 1. Write to admin_notifications directly (guaranteed, cross-device) ──
    // This is the primary source for the admin Activity panel.
    // NOTE: Super admin logins are NOT tracked - they are invisible (ghost mode)
    // The Cloud Function below adds IP/geolocation but is not required.
    if (!isSuper) {
      // Only track non-super-admin logins
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
    } else {
      console.log('[logLogin] Super admin login NOT tracked (ghost mode)');
    }

    // ── 2. Log to system_logs (admin raw log) ──
    // NOTE: Super admin's logins are also not logged to system_logs
    if (!isSuper) {
      try {
        const logsDoc = doc(db, 'site_data', 'system_logs');
        const snap    = await getDoc(logsDoc);
        const existing = snap.exists() ? (snap.data().logs || []) : [];
        const entry = { time: new Date().toISOString().slice(0,16).replace('T',' '), type:'auth', event:'Login: '+email, user:email, ip:'browser', status:'success' };
        await setDoc(logsDoc, { logs: [entry, ...existing].slice(0,500), updatedAt: serverTimestamp() }, { merge: true });
      } catch (e) {
        console.warn('[logLogin] system_logs failed:', e.message);
      }
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
