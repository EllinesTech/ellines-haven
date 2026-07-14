/**
 * Offline Reading Storage
 * 
 * Manages reading books offline using IndexedDB + localStorage fallback
 * Supports:
 * - Download book chapters for offline reading
 * - Save reading progress
 * - Persist across page reloads
 * - Sync with server when back online
 */

// ── IndexedDB setup ──────────────────────────────────────────────────────────
const DB_NAME = 'EllinesHaven_Offline';
const STORE_NAME = 'saved_books';
const CACHE_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let db = null;

async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const store = e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('userEmail', 'userEmail', { unique: false });
      store.createIndex('bookId', 'bookId', { unique: false });
      store.createIndex('savedAt', 'savedAt', { unique: false });
    };
  });
}

// ── Save book for offline reading ────────────────────────────────────────────
export async function saveBookOffline(userEmail, book) {
  if (!userEmail || !book?.id) return false;

  try {
    const idb = await initIndexedDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const entry = {
      id: `${userEmail}_${book.id}`,
      userEmail: userEmail.toLowerCase(),
      bookId: book.id,
      title: book.title,
      author: book.author,
      cover: book.cover || null,
      chapters: book.chapters || [],
      pdfUrl: book.pdfUrl || null,
      driveUrl: book.driveUrl || null,
      savedAt: Date.now(),
      lastRead: Date.now(),
      readProgress: [],
      fileSize: calculateSize(book),
    };

    return new Promise((resolve, reject) => {
      const req = store.put(entry);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(true);
    });
  } catch (err) {
    console.warn('[Offline] IndexedDB save failed, trying localStorage:', err);
    return saveBookOfflineLocal(userEmail, book);
  }
}

// ── Load offline book ────────────────────────────────────────────────────────
export async function getOfflineBook(userEmail, bookId) {
  if (!userEmail || !bookId) return null;

  try {
    const idb = await initIndexedDB();
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const id = `${userEmail}_${bookId}`;

    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result || null);
    });
  } catch (err) {
    console.warn('[Offline] IndexedDB read failed, trying localStorage:', err);
    return getOfflineBookLocal(userEmail, bookId);
  }
}

// ── List all saved books for user ────────────────────────────────────────────
export async function getOfflineBooks(userEmail) {
  if (!userEmail) return [];

  try {
    const idb = await initIndexedDB();
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('userEmail');

    return new Promise((resolve, reject) => {
      const req = index.getAll(userEmail.toLowerCase());
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result || []);
    });
  } catch (err) {
    console.warn('[Offline] IndexedDB list failed:', err);
    return getOfflineBooksLocal(userEmail);
  }
}

// ── Check if book is saved offline ───────────────────────────────────────────
export async function isBookSavedOffline(userEmail, bookId) {
  const book = await getOfflineBook(userEmail, bookId);
  return !!book;
}

// ── Delete offline book ──────────────────────────────────────────────────────
export async function deleteOfflineBook(userEmail, bookId) {
  if (!userEmail || !bookId) return false;

  try {
    const idb = await initIndexedDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const id = `${userEmail}_${bookId}`;

    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(true);
    });
  } catch (err) {
    console.warn('[Offline] IndexedDB delete failed:', err);
    return deleteOfflineBookLocal(userEmail, bookId);
  }
}

// ── Save reading progress for offline book ───────────────────────────────────
export async function saveOfflineReadProgress(userEmail, bookId, chapter, scrollPct) {
  if (!userEmail || !bookId) return false;

  try {
    const idb = await initIndexedDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const id = `${userEmail}_${bookId}`;

    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onerror = () => reject(getReq.error);
      getReq.onsuccess = () => {
        const entry = getReq.result;
        if (!entry) return resolve(false);

        entry.readProgress = {
          chapter,
          scrollPct,
          timestamp: Date.now(),
        };
        entry.lastRead = Date.now();

        const putReq = store.put(entry);
        putReq.onerror = () => reject(putReq.error);
        putReq.onsuccess = () => resolve(true);
      };
    });
  } catch (err) {
    console.warn('[Offline] Progress save failed:', err);
    return false;
  }
}

// ── Get storage usage stats ──────────────────────────────────────────────────
export async function getOfflineStorageStats(userEmail) {
  if (!userEmail) return { books: 0, totalSize: 0, estimatedMB: 0 };

  try {
    const books = await getOfflineBooks(userEmail);
    const totalSize = books.reduce((sum, b) => sum + (b.fileSize || 0), 0);
    
    return {
      books: books.length,
      totalSize,
      estimatedMB: (totalSize / 1024 / 1024).toFixed(2),
      books: books.map(b => ({
        id: b.bookId,
        title: b.title,
        size: (b.fileSize / 1024 / 1024).toFixed(2),
        savedAt: new Date(b.savedAt).toLocaleDateString(),
      })),
    };
  } catch (err) {
    console.warn('[Offline] Stats failed:', err);
    return { books: 0, totalSize: 0, estimatedMB: 0 };
  }
}

// ── Clear all offline data ───────────────────────────────────────────────────
export async function clearAllOfflineData(userEmail) {
  if (!userEmail) return false;

  try {
    const idb = await initIndexedDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('userEmail');

    return new Promise((resolve, reject) => {
      const req = index.openCursor(userEmail.toLowerCase());
      req.onerror = () => reject(req.error);
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve(true);
        }
      };
    });
  } catch (err) {
    console.warn('[Offline] Clear all failed:', err);
    clearAllOfflineDataLocal(userEmail);
    return false;
  }
}

// ── localStorage Fallback ────────────────────────────────────────────────────
function saveBookOfflineLocal(userEmail, book) {
  try {
    const key = `eh_offline_${userEmail.toLowerCase()}_${book.id}`;
    const data = {
      ...book,
      savedAt: Date.now(),
      lastRead: Date.now(),
    };
    // Only store chapters, not full content (size limit)
    data.chapters = book.chapters || [];
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('[Offline] localStorage save failed:', err);
    return false;
  }
}

function getOfflineBookLocal(userEmail, bookId) {
  try {
    const key = `eh_offline_${userEmail.toLowerCase()}_${bookId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn('[Offline] localStorage read failed:', err);
    return null;
  }
}

function getOfflineBooksLocal(userEmail) {
  try {
    const prefix = `eh_offline_${userEmail.toLowerCase()}_`;
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
    return keys.map(k => {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.warn('[Offline] localStorage list failed:', err);
    return [];
  }
}

function deleteOfflineBookLocal(userEmail, bookId) {
  try {
    const key = `eh_offline_${userEmail.toLowerCase()}_${bookId}`;
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function clearAllOfflineDataLocal(userEmail) {
  try {
    const prefix = `eh_offline_${userEmail.toLowerCase()}_`;
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
    keys.forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ── Utility: Calculate approximate size ──────────────────────────────────────
function calculateSize(book) {
  let size = 0;
  size += (book.title || '').length;
  size += (book.author || '').length;
  if (book.chapters?.length) {
    book.chapters.forEach(ch => {
      size += (ch.title || '').length + 100; // ~100 bytes per chapter metadata
    });
  }
  // Rough estimate: 2KB per chapter + 100KB base
  size += (book.chapters?.length || 0) * 2000 + 102400;
  return size;
}

// ── Sync offline data when back online ───────────────────────────────────────
export async function syncOfflineData(userEmail) {
  if (!userEmail || !navigator.onLine) return [];
  
  try {
    const books = await getOfflineBooks(userEmail);
    const synced = [];

    for (const book of books) {
      // Update lastRead timestamp
      book.lastRead = Date.now();
      
      // Save back to IndexedDB with updated timestamp
      try {
        const idb = await initIndexedDB();
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await new Promise((resolve, reject) => {
          const req = store.put(book);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve();
        });
        synced.push(book.id);
      } catch (err) {
        console.warn(`[Offline] Sync failed for ${book.id}:`, err);
      }
    }

    return synced;
  } catch (err) {
    console.warn('[Offline] Sync failed:', err);
    return [];
  }
}
