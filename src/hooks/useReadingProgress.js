/**
 * useReadingProgress — persists reading position per book per user.
 *
 * Storage strategy (dual-write):
 *  - localStorage  → instant, works offline, no latency
 *  - Firestore     → sync across devices (background write, throttled to 1/30s per book)
 *
 * Firestore path: `reading_progress/{userDocId}/books/{bookId}`
 * where userDocId = email with non-alphanumeric replaced by '_'
 *
 * Reads always prefer localStorage first (fast); Firestore is used on first
 * load of a new device to hydrate localStorage from cloud.
 */

import { useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const userDocId = (email) =>
  (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

const localKey = (email, bookId) =>
  email && bookId
    ? `eh_progress_${userDocId(email)}_${bookId}`
    : null;

// ── Single hook used in Reader ──────────────────────────────────────────────
export function useReadingProgress(userEmail, bookId) {
  const key        = localKey(userEmail, bookId);
  const saveTimerRef = useRef(null);

  // On mount: if no local progress, pull from Firestore (cross-device restore)
  useEffect(() => {
    if (!key || !userEmail || !bookId) return;
    const local = getLocalProgress(key);
    if (local) return; // already have local data — skip Firestore read
    (async () => {
      try {
        const snap = await getDoc(
          doc(db, 'reading_progress', userDocId(userEmail), 'books', String(bookId))
        );
        if (snap.exists()) {
          const data = snap.data();
          localStorage.setItem(key, JSON.stringify({
            chapter:   data.chapter   ?? 0,
            scrollPct: data.scrollPct ?? 0,
            lastRead:  data.lastReadMs || Date.now(),
          }));
        }
      } catch { /* non-fatal — offline or first-time user */ }
    })();
  }, [key, userEmail, bookId]); // eslint-disable-line

  const getProgress = () => getLocalProgress(key);

  const saveProgress = (chapter, scrollPct = 0) => {
    if (!key) return;
    const entry = { chapter, scrollPct, lastRead: Date.now() };
    // 1. Write localStorage immediately
    try { localStorage.setItem(key, JSON.stringify(entry)); } catch {}

    // 2. Debounce Firestore write — at most once per 30 s per book
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!userEmail || !bookId) return;
      setDoc(
        doc(db, 'reading_progress', userDocId(userEmail), 'books', String(bookId)),
        {
          chapter,
          scrollPct,
          lastReadMs: entry.lastRead,
          updatedAt:  serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {}); // silent — Firestore write is best-effort
    }, 30_000); // 30-second debounce keeps writes cheap
  };

  const clearProgress = () => {
    if (!key) return;
    localStorage.removeItem(key);
    if (!userEmail || !bookId) return;
    // Soft-delete in Firestore (set chapter back to 0)
    setDoc(
      doc(db, 'reading_progress', userDocId(userEmail), 'books', String(bookId)),
      { chapter: 0, scrollPct: 0, lastReadMs: null, clearedAt: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
  };

  return { getProgress, saveProgress, clearProgress };
}

// ── Helper: read from localStorage ──────────────────────────────────────────
function getLocalProgress(key) {
  if (!key) return null;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

/**
 * getAllReadingStats — returns reading data for all books for a user.
 * Reads from localStorage only (synchronous, used in MyLibrary stats tab).
 * Firestore data is populated into localStorage lazily via useReadingProgress.
 */
export function getAllReadingStats(userEmail) {
  if (!userEmail) return {};
  const prefix = `eh_progress_${userDocId(userEmail)}_`;
  const stats  = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const bookId = k.slice(prefix.length);
        const v      = localStorage.getItem(k);
        if (v) stats[bookId] = JSON.parse(v);
      }
    }
  } catch {}
  return stats;
}

/**
 * hydrateReadingStats — pull ALL progress entries for a user from Firestore
 * and merge into localStorage.  Call this once when user opens MyLibrary,
 * so their stats are current on any device.
 */
export async function hydrateReadingStats(userEmail) {
  if (!userEmail) return;
  try {
    const { collection, getDocs } = await import('firebase/firestore');
    const colRef = collection(
      db, 'reading_progress', userDocId(userEmail), 'books'
    );
    const snap = await getDocs(colRef);
    snap.forEach(d => {
      const bookId = d.id;
      const data   = d.data();
      const k      = localKey(userEmail, bookId);
      if (!k) return;
      const local = getLocalProgress(k);
      // Only overwrite if Firestore is newer
      if (!local || (data.lastReadMs && data.lastReadMs > (local.lastRead || 0))) {
        try {
          localStorage.setItem(k, JSON.stringify({
            chapter:   data.chapter   ?? 0,
            scrollPct: data.scrollPct ?? 0,
            lastRead:  data.lastReadMs || Date.now(),
          }));
        } catch {}
      }
    });
  } catch { /* non-fatal */ }
}
