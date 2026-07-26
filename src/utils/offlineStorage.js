/**
 * Compatibility layer — delegates to IndexedDB-backed useOfflineBook.
 * Prefer importing from '../hooks/useOfflineBook' in new code.
 */
export {
  saveBookOffline,
  getOfflineBook,
  listOfflineBooks as getOfflineBooks,
  isBookSavedOffline,
  removeOfflineBook as deleteOfflineBook,
  formatOfflineSize,
  countOfflineBooks,
} from '../hooks/useOfflineBook';

export async function getOfflineStorageStats(userEmail) {
  const { listOfflineBooks, formatOfflineSize } = await import('../hooks/useOfflineBook');
  const books = await listOfflineBooks(userEmail);
  const totalSize = books.reduce((sum, b) => sum + (b.approxBytes || 0), 0);
  return {
    count: books.length,
    totalSize,
    estimatedMB: (totalSize / 1024 / 1024).toFixed(2),
    books: books.map((b) => ({
      id: b.bookId,
      title: b.title,
      size: formatOfflineSize(b.approxBytes || 0),
      savedAt: b.savedAt ? new Date(b.savedAt).toLocaleDateString() : '',
    })),
  };
}

export async function clearAllOfflineData(userEmail) {
  const { listOfflineBooks, removeOfflineBook } = await import('../hooks/useOfflineBook');
  const books = await listOfflineBooks(userEmail);
  await Promise.all(books.map((b) => removeOfflineBook(userEmail, b.bookId)));
  return true;
}

export async function saveOfflineReadProgress() {
  return false; // progress lives in useReadingProgress
}

export async function syncOfflineData(userEmail) {
  const { listOfflineBooks } = await import('../hooks/useOfflineBook');
  const books = await listOfflineBooks(userEmail);
  return books.map((b) => b.bookId);
}
