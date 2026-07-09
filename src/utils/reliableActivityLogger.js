/**
 * Reliable Activity Logger
 * Logs user activities with retry logic and localStorage persistence
 * Ensures activities are recorded even if network fails
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

// Queue key for localStorage persistence
const ACTIVITY_QUEUE_KEY = 'ellines_activity_queue';

/**
 * Get or create a device ID (persisted in localStorage)
 */
export function getDeviceId() {
  const key = 'ellines_device_id';
  let deviceId = localStorage.getItem(key);
  
  if (!deviceId) {
    // Generate unique device ID
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(key, deviceId);
  }
  
  return deviceId;
}

/**
 * Get browser fingerprint (for cross-device correlation)
 */
export function getBrowserFingerprint() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const fingerprint = [
    nav.userAgent || 'unknown',
    nav.language || 'unknown',
    nav.platform || 'unknown',
    new Date().getTimezoneOffset(),
    screen?.width + 'x' + screen?.height,
  ].join('|');
  
  return fingerprint;
}

/**
 * Get activity queue from localStorage
 */
function getActivityQueue() {
  try {
    const queue = localStorage.getItem(ACTIVITY_QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  } catch {
    return [];
  }
}

/**
 * Save activity queue to localStorage
 */
function saveActivityQueue(queue) {
  try {
    localStorage.setItem(ACTIVITY_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('[reliableActivityLogger] Failed to save queue:', err);
  }
}

/**
 * Add activity to queue (persisted in localStorage)
 */
function queueActivity(activity) {
  const queue = getActivityQueue();
  // Cap queue at 20 entries so it can never grow unbounded
  if (queue.length >= 20) queue.shift();
  queue.push({
    ...activity,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  saveActivityQueue(queue);
  return queue.length;
}

/**
 * Log user login on the server (reliable)
 * - Runs server-side to ensure recording
 * - Includes retry logic with localStorage persistence
 */
export async function logUserLoginReliable(userEmail, userName, metadata = {}) {
  const logFn = httpsCallable(functions, 'logUserLoginServer');
  
  const activity = {
    type: 'login',
    userEmail: userEmail.toLowerCase(),
    userName: userName || userEmail,
    device: metadata.device || getDeviceFromUserAgent(),
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  };

  try {
    // Try to call server function
    const result = await logFn({
      userEmail: activity.userEmail,
      userName: activity.userName,
      metadata: {
        device: activity.device,
        userAgent: activity.userAgent,
      },
    });

    console.log('[logUserLoginReliable] Success:', result.data);
    return { success: true, ...result.data };
  } catch (err) {
    console.error('[logUserLoginReliable] Failed:', err.message);
    
    // Queue for retry on next app load — no recursive setTimeout
    const queueLength = queueActivity(activity);
    console.log(`[logUserLoginReliable] Activity queued for retry (queue length: ${queueLength})`);
    
    // Return success anyway - activity is queued
    return { success: true, queued: true };
  }
}

/**
 * Log user registration on the server
 */
export async function logUserRegistrationReliable(userEmail, userName, metadata = {}) {
  const logFn = httpsCallable(functions, 'logUserRegistrationServer');
  
  const activity = {
    type: 'registration',
    userEmail: userEmail.toLowerCase(),
    userName: userName || userEmail,
    device: metadata.device || getDeviceFromUserAgent(),
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  };

  try {
    const result = await logFn({
      userEmail: activity.userEmail,
      userName: activity.userName,
      metadata: {
        device: activity.device,
        userAgent: activity.userAgent,
      },
    });

    console.log('[logUserRegistrationReliable] Success:', result.data);
    return { success: true, ...result.data };
  } catch (err) {
    console.error('[logUserRegistrationReliable] Failed:', err.message);
    
    // Queue for retry on next app load — no recursive setTimeout
    queueActivity(activity);
    
    return { success: true, queued: true };
  }
}

/**
 * Flush queued activities (retry failed submissions).
 * Called once on app load by initializeActivityLogger().
 * Does NOT schedule itself — no recursive timeouts.
 */
export async function flushActivityQueue() {
  const queue = getActivityQueue();
  
  if (queue.length === 0) {
    return { flushed: 0 };
  }

  // Safety: discard corrupt / ancient entries (older than 7 days)
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const fresh = queue.filter(a => {
    const age = Date.now() - new Date(a.queuedAt || 0).getTime();
    return age < SEVEN_DAYS && (a.attempts || 0) < 3;
  });
  if (fresh.length !== queue.length) {
    saveActivityQueue(fresh);
    if (fresh.length === 0) return { flushed: 0 };
  }

  console.log(`[flushActivityQueue] Processing ${fresh.length} queued activities`);
  let flushed = 0;
  const remaining = [];

  for (const activity of fresh) {
    try {
      const logFn = httpsCallable(functions,
        activity.type === 'login' ? 'logUserLoginServer' : 'logUserRegistrationServer'
      );

      await logFn({
        userEmail: activity.userEmail,
        userName:  activity.userName,
        metadata: {
          device:    activity.device,
          userAgent: activity.userAgent,
        },
      });

      console.log(`[flushActivityQueue] Successfully flushed:`, activity.type);
      flushed++;
      // Successfully sent — do NOT add to remaining
    } catch (err) {
      const attempts = (activity.attempts || 0) + 1;
      if (attempts < 3) {
        remaining.push({ ...activity, attempts });
        console.warn(`[flushActivityQueue] Retry ${attempts}/3 failed for ${activity.type}:`, err.message);
      } else {
        console.warn(`[flushActivityQueue] Giving up on activity after 3 attempts:`, activity.type);
      }
    }
  }

  saveActivityQueue(remaining);
  return { flushed, remaining: remaining.length };
}

/**
 * Determine device type from user agent
 */
export function getDeviceFromUserAgent() {
  const ua = navigator.userAgent.toLowerCase();
  
  if (/mobile|android|iphone|ipad|phone/.test(ua)) {
    if (/ipad|tablet/.test(ua)) return 'Tablet';
    return 'Mobile';
  }
  
  if (/windows|win32/.test(ua)) return 'Windows';
  if (/macintosh|mac os/.test(ua)) return 'Mac';
  if (/linux/.test(ua)) return 'Linux';
  
  return 'Desktop';
}

/**
 * On app load: try to flush any queued activities
 */
export function initializeActivityLogger() {
  // Flush queue on startup
  flushActivityQueue().then(result => {
    if (result.flushed > 0) {
      console.log(`[initializeActivityLogger] Flushed ${result.flushed} queued activities`);
    }
  });

  // Also try to flush before page unload
  window.addEventListener('beforeunload', () => {
    const queue = getActivityQueue();
    if (queue.length > 0) {
      console.log(`[initializeActivityLogger] Page unload: ${queue.length} activities still queued`);
    }
  });
}
