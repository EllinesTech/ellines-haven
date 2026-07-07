/**
 * userNotifier.js
 * Writes to `user_notifications` collection — the per-user bell/feed.
 * Each notification belongs to ONE user (keyed by userEmail).
 * Completely separate from admin_notifications.
 */

import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Create a notification for a specific user.
 * @param {object} opts
 * @param {string} opts.userEmail  - recipient's email (lowercase)
 * @param {string} opts.title      - short headline
 * @param {string} opts.message    - body text
 * @param {string} [opts.type]     - 'book_ready' | 'order_confirmed' | 'welcome' | 'info'
 * @param {string} [opts.bookId]   - link to a book page (optional)
 * @param {string} [opts.orderId]  - reference order id (optional)
 */
export async function notifyUser({ userEmail, title, message, type = 'info', bookId = null, orderId = null, _id = null }) {
  if (!userEmail) return;
  try {
    const id = _id || `un_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await setDoc(doc(db, 'user_notifications', id), {
      userEmail: userEmail.toLowerCase(),
      title,
      message,
      type,
      bookId:  bookId  || null,
      orderId: orderId || null,
      read:    false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // Non-fatal — notifications are best-effort
    console.warn('[notifyUser]', e.message);
  }
}

/**
 * Notify user that their books have been unlocked after a purchase.
 * @param {string} userEmail
 * @param {Array}  items    - array of { id, title }
 * @param {string} orderId
 */
export async function notifyBooksUnlocked(userEmail, items, orderId) {
  if (!userEmail || !items?.length) return;
  const bookList = items.map(i => i.title).join(', ');
  const single   = items.length === 1;
  await notifyUser({
    userEmail,
    title:   `📚 ${single ? 'Book' : 'Books'} Unlocked!`,
    message: `Your ${single ? `"${bookList}"` : `${items.length} books (${bookList})`} ${single ? 'is' : 'are'} ready to read in your library.`,
    type:    'book_ready',
    bookId:  single ? items[0].id : null,
    orderId,
  });
}

/**
 * Send a welcome-back notification when a user logs in on a new device.
 * Deduped in Firestore using a date-keyed doc ID so it fires only once per day
 * regardless of browser, device, or incognito session.
 * @param {string} userEmail
 * @param {string} userName
 */
export async function notifyLoginWelcome(userEmail, userName) {
  if (!userEmail) return;
  const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  // Use a deterministic doc ID — fires only once per day regardless of device
  const dedupId = `welcome_${userEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${dayKey}`;
  try {
    const existing = await getDoc(doc(db, 'user_notifications', dedupId));
    if (existing.exists()) return; // already sent today from any device
    await notifyUser({
      userEmail,
      title:   `👋 Welcome back, ${userName || 'Reader'}!`,
      message: `You're now signed in. Your library and orders are ready.`,
      type:    'info',
      _id: dedupId,
    });
  } catch (e) {
    console.warn('[notifyLoginWelcome]', e.message);
  }
}

/**
 * Notify user that an order was placed (payment pending).
 * @param {string} userEmail
 * @param {string} orderId
 * @param {number} total
 */
export async function notifyOrderPlaced(userEmail, orderId, total) {
  if (!userEmail) return;
  await notifyUser({
    userEmail,
    title:   '🛒 Order Received',
    message: `Your order ${orderId} for KSh ${total?.toLocaleString()} has been received and is awaiting payment confirmation.`,
    type:    'order_confirmed',
    orderId,
  });
}
