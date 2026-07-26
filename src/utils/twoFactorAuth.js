/**
 * Client helpers for email OTP two-factor authentication.
 * OTPs are generated and verified server-side (Cloud Functions).
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const SUPER_ADMIN_EMAIL = 'ellines.haven@gmail.com';

export async function getSecuritySettings() {
  try {
    const snap = await getDoc(doc(db, 'site_data', 'security_settings'));
    return snap.exists() ? snap.data() : {};
  } catch {
    return {};
  }
}

/**
 * Decide whether this login requires a second factor.
 * - User/admin flag twoFactorEnabled
 * - Site setting forceAdmin2FA for admin/superadmin roles
 * - Site setting require2FAForAll
 */
export function shouldRequire2FA(account, securitySettings = {}) {
  if (!account) return false;
  if (account.twoFactorEnabled === true) return true;
  const role = (account.role || 'user').toLowerCase();
  const isAdmin = role === 'admin' || role === 'superadmin'
    || (account.email || '').toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
  // Only enforce when explicitly enabled in Security settings (avoids admin lockout
  // if email delivery is misconfigured before 2FA is turned on).
  if (securitySettings.forceAdmin2FA === true && isAdmin) return true;
  if (securitySettings.require2FAForAll === true) return true;
  return false;
}

export async function sendLoginOtp({ email, name, phone }) {
  const fn = httpsCallable(getFunctions(), 'sendLoginOtp');
  const result = await fn({
    email: String(email || '').trim().toLowerCase(),
    name: name || 'Valued Reader',
    phone: phone || '',
  });
  return result.data || {};
}

export async function verifyLoginOtp({ email, otp, purpose = 'login' }) {
  const fn = httpsCallable(getFunctions(), 'verifyAuthOtp');
  const result = await fn({
    email: String(email || '').trim().toLowerCase(),
    otp: String(otp || '').trim(),
    purpose,
  });
  return result.data || {};
}

export async function sendPasswordResetOtpServer({ email, name, phone }) {
  const fn = httpsCallable(getFunctions(), 'sendPasswordResetOtp');
  // Server generates the OTP when client omits it
  const result = await fn({
    email: String(email || '').trim().toLowerCase(),
    name: name || 'Valued Reader',
    phone: phone || '',
  });
  return result.data || {};
}
