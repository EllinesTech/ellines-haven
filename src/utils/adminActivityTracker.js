/**
 * Admin Activity Tracker
 * Logs user activities and sends notifications to admin/superadmin
 */

import { doc, setDoc, getDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Notification categories
export const NOTIFICATION_CATEGORIES = {
  USER_LOGIN: 'user_login',
  USER_REGISTRATION: 'user_registration',
  VISITOR: 'visitor',
  PAYMENT: 'payment',
  BOOK_PURCHASE: 'book_purchase',
  BOOK_DOWNLOAD: 'book_download',
  CONTACT_MESSAGE: 'contact_message',
  REVIEW_SUBMITTED: 'review_submitted',
  NEWSLETTER_SIGNUP: 'newsletter_signup',
  WISHLIST_ADD: 'wishlist_add',
  CART_CHECKOUT: 'cart_checkout',
  ACCOUNT_DELETION: 'account_deletion',
  PASSWORD_RESET: 'password_reset',
  PROFILE_UPDATE: 'profile_update',
  SYSTEM: 'system',
};

// Category icons
const CATEGORY_ICONS = {
  [NOTIFICATION_CATEGORIES.USER_LOGIN]: '🔐',
  [NOTIFICATION_CATEGORIES.USER_REGISTRATION]: '👤',
  [NOTIFICATION_CATEGORIES.VISITOR]: '👁️',
  [NOTIFICATION_CATEGORIES.PAYMENT]: '💳',
  [NOTIFICATION_CATEGORIES.BOOK_PURCHASE]: '📚',
  [NOTIFICATION_CATEGORIES.BOOK_DOWNLOAD]: '⬇️',
  [NOTIFICATION_CATEGORIES.CONTACT_MESSAGE]: '✉️',
  [NOTIFICATION_CATEGORIES.REVIEW_SUBMITTED]: '⭐',
  [NOTIFICATION_CATEGORIES.NEWSLETTER_SIGNUP]: '📧',
  [NOTIFICATION_CATEGORIES.WISHLIST_ADD]: '❤️',
  [NOTIFICATION_CATEGORIES.CART_CHECKOUT]: '🛒',
  [NOTIFICATION_CATEGORIES.ACCOUNT_DELETION]: '🗑️',
  [NOTIFICATION_CATEGORIES.PASSWORD_RESET]: '🔑',
  [NOTIFICATION_CATEGORIES.PROFILE_UPDATE]: '✏️',
  [NOTIFICATION_CATEGORIES.SYSTEM]: '⚙️',
};

// Category labels
export const CATEGORY_LABELS = {
  [NOTIFICATION_CATEGORIES.USER_LOGIN]: 'User Login',
  [NOTIFICATION_CATEGORIES.USER_REGISTRATION]: 'User Registration',
  [NOTIFICATION_CATEGORIES.VISITOR]: 'Site Visit',
  [NOTIFICATION_CATEGORIES.PAYMENT]: 'Payment',
  [NOTIFICATION_CATEGORIES.BOOK_PURCHASE]: 'Book Purchase',
  [NOTIFICATION_CATEGORIES.BOOK_DOWNLOAD]: 'Book Download',
  [NOTIFICATION_CATEGORIES.CONTACT_MESSAGE]: 'Contact Message',
  [NOTIFICATION_CATEGORIES.REVIEW_SUBMITTED]: 'Review',
  [NOTIFICATION_CATEGORIES.NEWSLETTER_SIGNUP]: 'Newsletter',
  [NOTIFICATION_CATEGORIES.WISHLIST_ADD]: 'Wishlist',
  [NOTIFICATION_CATEGORIES.CART_CHECKOUT]: 'Checkout',
  [NOTIFICATION_CATEGORIES.ACCOUNT_DELETION]: 'Account Deletion',
  [NOTIFICATION_CATEGORIES.PASSWORD_RESET]: 'Password Reset',
  [NOTIFICATION_CATEGORIES.PROFILE_UPDATE]: 'Profile Update',
  [NOTIFICATION_CATEGORIES.SYSTEM]: 'System',
};

/**
 * Get admin notification preferences
 */
export async function getAdminNotificationPreferences(adminEmail) {
  try {
    const snap = await getDoc(doc(db, 'admin_preferences', adminEmail.toLowerCase()));
    if (snap.exists()) {
      return snap.data();
    }
    // Default preferences: all categories enabled, sound enabled
    return {
      email: adminEmail,
      mutedCategories: [],
      soundEnabled: true,
      desktopEnabled: true,
      autoMarkRead: false,
      updatedAt: new Date(),
    };
  } catch (err) {
    console.error('[getAdminNotificationPreferences]', err);
    return { email: adminEmail, mutedCategories: [], soundEnabled: true };
  }
}

/**
 * Save admin notification preferences
 */
export async function saveAdminNotificationPreferences(adminEmail, preferences) {
  try {
    await setDoc(
      doc(db, 'admin_preferences', adminEmail.toLowerCase()),
      {
        ...preferences,
        email: adminEmail,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('[saveAdminNotificationPreferences]', err);
    return false;
  }
}

/**
 * Track activity and notify admins
 */
export async function trackActivity({
  category,
  title,
  message,
  userEmail = null,
  userName = null,
  metadata = {},
  priority = 'normal', // 'low', 'normal', 'high'
}) {
  try {
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const notificationData = {
      id: notificationId,
      category,
      title,
      message,
      icon: CATEGORY_ICONS[category] || '🔔',
      userEmail,
      userName,
      metadata: {
        ...metadata,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
      priority,
      read: false,
      createdAt: serverTimestamp(),
      readBy: [], // Array of admin emails who have read this
    };

    // Save to admin_notifications collection
    await setDoc(
      doc(db, 'admin_notifications', notificationId),
      notificationData
    );

    // Also log to activity log for historical tracking (best-effort, non-blocking)
    logActivity({
      category,
      action: title,
      details: message,
      userEmail,
      userName,
      metadata,
    }).catch(e => console.warn('[trackActivity] logActivity failed:', e.message));

    return notificationId;
  } catch (err) {
    console.error('[trackActivity]', err);
    return null;
  }
}

/**
 * Log activity to system logs (separate from notifications)
 */
async function logActivity({ category, action, details, userEmail, userName, metadata }) {
  try {
    const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await setDoc(doc(db, 'activity_logs', logId), {
      id: logId,
      category,
      action,
      details,
      userEmail,
      userName,
      metadata,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error('[logActivity]', err);
  }
}

/**
 * Mark notification as read for a specific admin
 */
export async function markNotificationRead(notificationId, adminEmail) {
  try {
    const notifRef = doc(db, 'admin_notifications', notificationId);
    const snap = await getDoc(notifRef);
    
    if (snap.exists()) {
      const data = snap.data();
      const readBy = data.readBy || [];
      
      if (!readBy.includes(adminEmail)) {
        await setDoc(
          notifRef,
          {
            readBy: [...readBy, adminEmail],
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
    return true;
  } catch (err) {
    console.error('[markNotificationRead]', err);
    return false;
  }
}

/**
 * Mark all notifications as read for admin
 */
export async function markAllNotificationsRead(notificationIds, adminEmail) {
  try {
    const promises = notificationIds.map(id => markNotificationRead(id, adminEmail));
    await Promise.all(promises);
    return true;
  } catch (err) {
    console.error('[markAllNotificationsRead]', err);
    return false;
  }
}

/**
 * Delete notification (superadmin only)
 */
export async function deleteNotification(notificationId) {
  try {
    await setDoc(
      doc(db, 'admin_notifications', notificationId),
      { deleted: true, deletedAt: serverTimestamp() },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('[deleteNotification]', err);
    return false;
  }
}

/**
 * Get category icon
 */
export function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || '🔔';
}

/**
 * Get category label
 */
export function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

/**
 * Check if category is muted for admin
 */
export function isCategoryMuted(category, mutedCategories = []) {
  return mutedCategories.includes(category);
}
