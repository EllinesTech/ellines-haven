/**
 * useOfflineBook — saves book chapters to localStorage so the user
 * can read without an internet connection.
 *
 * Storage key: eh_offline_book_{userDocId}_{bookId}
 * Stores: { bookId, title, author, cover, savedAt, chapters[] }
 *
 * This is NOT a downloadable file. The data lives only in the
 * browser's localStorage — it cannot be shared or transferred.
 */

const userDocId = (email) =>
  (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

export const offlineKey = (email, bookId) =>
  email && bookId
    ? `eh_offline_book_${userDocId(email)}_${bookId}`
    : null;

/**
 * Check if a book is saved for offline reading.
 */
export function isBookSavedOffline(email, bookId) {
  const key = offlineKey(email, bookId);
  if (!key) return false;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return Array.isArray(data?.chapters) && data.chapters.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get offline-cached chapters for a book.
 * Returns null if not cached.
 */
export function getOfflineBook(email, bookId) {
  const key = offlineKey(email, bookId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save chapters for offline reading.
 * Only saves chapter title + text (no PDF — PDFs require Google Drive and cannot be cached).
 */
export function saveBookOffline(email, bookId, bookMeta, chapters) {
  const key = offlineKey(email, bookId);
  if (!key) return false;
  try {
    const payload = {
      bookId,
      title:     bookMeta.title   || '',
      author:    bookMeta.author  || '',
      cover:     bookMeta.cover   || '',
      savedAt:   Date.now(),
      chapters:  chapters.map(ch => ({
        title:      ch.title      || '',
        subtitle:   ch.subtitle   || '',
        part:       ch.part       || '',
        text:       ch.text       || '',
        endMessage: ch.endMessage || '',
      })),
    };
    localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch (e) {
    // localStorage may be full
    console.warn('[OfflineBook] save failed:', e.message);
    return false;
  }
}

/**
 * Remove a book's offline cache.
 */
export function removeOfflineBook(email, bookId) {
  const key = offlineKey(email, bookId);
  if (!key) return;
  localStorage.removeItem(key);
}

/**
 * List all books the user has saved offline.
 * Returns array of { bookId, title, author, cover, savedAt }
 */
export function listOfflineBooks(email) {
  const prefix = `eh_offline_book_${userDocId(email)}_`;
  const result = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        try {
          const data = JSON.parse(localStorage.getItem(k) || '{}');
          result.push({
            bookId:   data.bookId,
            title:    data.title,
            author:   data.author,
            cover:    data.cover,
            savedAt:  data.savedAt,
            chapters: data.chapters?.length || 0,
          });
        } catch { /* skip malformed */ }
      }
    }
  } catch { /* ignore */ }
  return result;
}
