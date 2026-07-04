/**
 * useReadingProgress — persists reading position per book per user.
 * Stores: { chapter, scrollPct, lastRead } in localStorage.
 * Key: `eh_progress_${userEmail}_${bookId}`
 */
export function useReadingProgress(userEmail, bookId) {
  const key = userEmail && bookId
    ? `eh_progress_${userEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${bookId}`
    : null;

  const getProgress = () => {
    if (!key) return null;
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  };

  const saveProgress = (chapter, scrollPct = 0) => {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({
        chapter,
        scrollPct,
        lastRead: Date.now(),
      }));
    } catch {}
  };

  const clearProgress = () => {
    if (!key) return;
    localStorage.removeItem(key);
  };

  return { getProgress, saveProgress, clearProgress };
}

/**
 * getAllReadingStats — returns reading data for all books for a user.
 * Used in the Reading Stats tab in MyLibrary.
 */
export function getAllReadingStats(userEmail) {
  if (!userEmail) return {};
  const prefix = `eh_progress_${userEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}_`;
  const stats = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const bookId = k.slice(prefix.length);
        const v = localStorage.getItem(k);
        if (v) stats[bookId] = JSON.parse(v);
      }
    }
  } catch {}
  return stats;
}
