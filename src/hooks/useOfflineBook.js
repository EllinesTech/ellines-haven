/**
 * Offline books — IndexedDB primary, localStorage migration/fallback.
 *
 * Persists across refresh and browser restarts on the same device.
 * API is async; callers should await.
 *
 * Entry shape:
 * { bookId, title, author, cover, slug, savedAt, chapters[], chapterCount, approxBytes }
 */

import { titleToSlug } from '../utils/slugify';

const DB_NAME = 'EllinesHaven_Offline';
const DB_VERSION = 2;
const STORE = 'books';

const userDocId = (email) =>
  (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

export const offlineKey = (email, bookId) =>
  email && bookId ? `eh_offline_book_${userDocId(email)}_${bookId}` : null;

const entryId = (email, bookId) => `${userDocId(email)}__${String(bookId)}`;

function toPublicBook(row) {
  if (!row?.chapters?.length) return null;
  return {
    bookId: String(row.bookId),
    title: row.title || '',
    author: row.author || '',
    cover: row.cover || '',
    slug: row.slug || titleToSlug(row.title || '') || '',
    savedAt: row.savedAt || 0,
    chapters: row.chapters,
    chapterCount: row.chapterCount || row.chapters.length,
    approxBytes: row.approxBytes || 0,
  };
}

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('IndexedDB open failed'));
    };
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('userKey', 'userKey', { unique: false });
        store.createIndex('bookId', 'bookId', { unique: false });
      }
    };
  });
  return dbPromise;
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function normalizeChapters(chapters = []) {
  return (Array.isArray(chapters) ? chapters : []).map((ch) => ({
    title: ch.title || '',
    subtitle: ch.subtitle || '',
    part: ch.part || '',
    text: ch.text || '',
    endMessage: ch.endMessage || '',
  }));
}

function buildPayload(email, bookId, bookMeta = {}, chapters = []) {
  const normalized = normalizeChapters(chapters);
  const json = JSON.stringify(normalized);
  const approxBytes = typeof Blob !== 'undefined'
    ? new Blob([json]).size
    : json.length * 2;
  const slug = bookMeta.slug || titleToSlug(bookMeta.title || '') || '';
  return {
    id: entryId(email, bookId),
    userKey: userDocId(email),
    bookId: String(bookId),
    title: bookMeta.title || '',
    author: bookMeta.author || '',
    cover: bookMeta.cover || '',
    slug,
    savedAt: Date.now(),
    chapters: normalized,
    chapterCount: normalized.length,
    approxBytes,
  };
}

function readLegacyLocal(email, bookId) {
  const key = offlineKey(email, bookId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data?.chapters) || !data.chapters.length) return null;
    return {
      bookId: String(data.bookId || bookId),
      title: data.title || '',
      author: data.author || '',
      cover: data.cover || '',
      slug: data.slug || '',
      savedAt: data.savedAt || Date.now(),
      chapters: normalizeChapters(data.chapters),
      chapterCount: data.chapters.length,
      approxBytes: raw.length,
    };
  } catch {
    return null;
  }
}

function writeLegacyLocal(email, bookId, payload) {
  const key = offlineKey(email, bookId);
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify({
      bookId: payload.bookId,
      title: payload.title,
      author: payload.author,
      cover: payload.cover,
      slug: payload.slug,
      savedAt: payload.savedAt,
      chapters: payload.chapters,
    }));
    return true;
  } catch {
    return false;
  }
}

function removeLegacyLocal(email, bookId) {
  const key = offlineKey(email, bookId);
  if (key) localStorage.removeItem(key);
}

function listLegacyLocal(email) {
  const prefix = `eh_offline_book_${userDocId(email)}_`;
  const result = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefix)) continue;
      try {
        const data = JSON.parse(localStorage.getItem(k) || '{}');
        if (!Array.isArray(data?.chapters) || !data.chapters.length) continue;
        result.push({
          bookId: String(data.bookId || ''),
          title: data.title || '',
          author: data.author || '',
          cover: data.cover || '',
          slug: data.slug || '',
          savedAt: data.savedAt || 0,
          chapters: data.chapters.length,
          chapterCount: data.chapters.length,
          approxBytes: (localStorage.getItem(k) || '').length,
        });
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return result;
}

async function putIdb(payload) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await idbRequest(tx.objectStore(STORE).put(payload));
  return true;
}

async function getIdb(email, bookId) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const row = await idbRequest(tx.objectStore(STORE).get(entryId(email, bookId)));
  if (!row?.chapters?.length) return null;
  return row;
}

async function deleteIdb(email, bookId) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await idbRequest(tx.objectStore(STORE).delete(entryId(email, bookId)));
  return true;
}

async function listIdb(email) {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const index = store.index('userKey');
  const rows = await idbRequest(index.getAll(userDocId(email)));
  return (rows || [])
    .filter((r) => Array.isArray(r.chapters) && r.chapters.length > 0)
    .map((r) => ({
      bookId: String(r.bookId),
      title: r.title || '',
      author: r.author || '',
      cover: r.cover || '',
      slug: r.slug || titleToSlug(r.title || '') || '',
      savedAt: r.savedAt || 0,
      chapters: r.chapterCount || r.chapters.length,
      chapterCount: r.chapterCount || r.chapters.length,
      approxBytes: r.approxBytes || 0,
    }))
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

/**
 * Check if a book is saved for offline reading.
 */
export async function isBookSavedOffline(email, bookId) {
  if (!email || !bookId) return false;
  try {
    const row = await getIdb(email, bookId);
    if (row?.chapters?.length) return true;
  } catch { /* fall through */ }
  return !!readLegacyLocal(email, bookId);
}

/**
 * Get offline-cached book (full chapters).
 * Migrates legacy localStorage → IndexedDB when found.
 */
export async function getOfflineBook(email, bookId) {
  if (!email || !bookId) return null;
  try {
    const row = await getIdb(email, bookId);
    const pub = toPublicBook(row);
    if (pub) return pub;
  } catch { /* fall through */ }

  const legacy = readLegacyLocal(email, bookId);
  if (!legacy) return null;

  // Best-effort migrate so refresh + future reads use IndexedDB
  try {
    const payload = buildPayload(email, bookId, legacy, legacy.chapters);
    payload.savedAt = legacy.savedAt || payload.savedAt;
    await putIdb(payload);
  } catch { /* keep legacy */ }
  return toPublicBook(legacy) || legacy;
}

/**
 * Resolve a saved offline book from a reader URL param (book id OR slug).
 * Critical for refresh/offline: catalog may be empty while IndexedDB still has chapters.
 */
export async function findOfflineBook(email, slugOrId) {
  if (!email || !slugOrId) return null;

  const direct = await getOfflineBook(email, slugOrId);
  if (direct) return direct;

  const needle = String(slugOrId).toLowerCase();

  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const rows = await idbRequest(tx.objectStore(STORE).index('userKey').getAll(userDocId(email)));
    const match = (rows || []).find((r) => {
      if (!Array.isArray(r.chapters) || !r.chapters.length) return false;
      const slug = (r.slug || titleToSlug(r.title || '')).toLowerCase();
      return String(r.bookId) === String(slugOrId) || slug === needle;
    });
    const pub = toPublicBook(match);
    if (pub) return pub;
  } catch { /* fall through */ }

  // Legacy localStorage scan by slug
  const legacyList = listLegacyLocal(email);
  for (const meta of legacyList) {
    const slug = (meta.slug || titleToSlug(meta.title || '')).toLowerCase();
    if (String(meta.bookId) === String(slugOrId) || slug === needle) {
      return getOfflineBook(email, meta.bookId);
    }
  }
  return null;
}

/**
 * Save chapters for offline reading.
 * Returns { ok, reason?, count?, approxBytes? }
 * options.maxBooks — admin limit (skip count check when updating an already-kept book)
 */
export async function saveBookOffline(email, bookId, bookMeta, chapters, options = {}) {
  if (!email || !bookId) return { ok: false, reason: 'missing' };
  const normalized = normalizeChapters(chapters);
  if (!normalized.length) return { ok: false, reason: 'empty' };

  const maxBooks = Number(options.maxBooks);
  if (Number.isFinite(maxBooks) && maxBooks > 0) {
    const already = await isBookSavedOffline(email, bookId);
    if (!already) {
      const n = await countOfflineBooks(email);
      if (n >= maxBooks) return { ok: false, reason: 'limit', max: maxBooks };
    }
  }

  const payload = buildPayload(email, bookId, bookMeta, normalized);

  try {
    await putIdb(payload);
    // Mirror a slim copy in localStorage for older code paths / quick list recovery
    writeLegacyLocal(email, bookId, payload);
    return { ok: true, count: payload.chapterCount, approxBytes: payload.approxBytes };
  } catch (e) {
    const quota = e?.name === 'QuotaExceededError' || /quota/i.test(e?.message || '');
    // Fallback to localStorage only
    const localOk = writeLegacyLocal(email, bookId, payload);
    if (localOk) {
      return { ok: true, count: payload.chapterCount, approxBytes: payload.approxBytes, reason: 'local-fallback' };
    }
    console.warn('[OfflineBook] save failed:', e?.message || e);
    return { ok: false, reason: quota ? 'quota' : 'error' };
  }
}

/**
 * Remove a book's offline cache.
 */
export async function removeOfflineBook(email, bookId) {
  if (!email || !bookId) return false;
  removeLegacyLocal(email, bookId);
  try {
    await deleteIdb(email, bookId);
    return true;
  } catch (e) {
    console.warn('[OfflineBook] remove failed:', e?.message || e);
    return true; // legacy already cleared
  }
}

/**
 * List all books the user has saved offline (metadata only).
 */
export async function listOfflineBooks(email) {
  if (!email) return [];
  const byId = new Map();

  try {
    const idbList = await listIdb(email);
    idbList.forEach((b) => byId.set(String(b.bookId), b));
  } catch { /* ignore */ }

  // Merge legacy localStorage entries (and migrate missing ones)
  const legacy = listLegacyLocal(email);
  for (const b of legacy) {
    if (!byId.has(String(b.bookId))) {
      byId.set(String(b.bookId), b);
      try {
        const full = readLegacyLocal(email, b.bookId);
        if (full) {
          const payload = buildPayload(email, b.bookId, full, full.chapters);
          payload.savedAt = full.savedAt || payload.savedAt;
          await putIdb(payload);
        }
      } catch { /* ignore migrate errors */ }
    }
  }

  return Array.from(byId.values()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

/**
 * Count saved offline books (for badges / max limits).
 */
export async function countOfflineBooks(email) {
  const list = await listOfflineBooks(email);
  return list.length;
}

/**
 * Format bytes for friendly UI copy.
 */
export function formatOfflineSize(bytes = 0) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
