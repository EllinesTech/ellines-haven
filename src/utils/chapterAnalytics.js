/**
 * chapterAnalytics.js
 *
 * Lightweight utility to track chapter reads and check scheduled releases.
 * All writes are fire-and-forget — never block the reading experience.
 *
 * Firestore schema:
 *   chapter_analytics/{bookId_chN_YYYY-MM-DD}  → per-day per-chapter read count
 *   site_data/chapter_schedules                → scheduled release dates
 */

import { doc, setDoc, getDoc, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// ── Track a chapter read ────────────────────────────────────────────────────
/**
 * Call whenever the user switches to a chapter in Reader.
 *
 * Schema per doc (chapter_analytics/{bookId}_ch{chapterIndex}_{YYYY-MM-DD}):
 *   bookId, bookTitle, chapter, date  — identifiers
 *   reads        {number}  — total open events (increments every call)
 *   readers      {string[]}— unique reader emails for this day (arrayUnion)
 *   readAt       {timestamp} — last updated
 */
export function trackChapterRead(userEmail, bookId, bookTitle, chapterIndex) {
  if (!userEmail || !bookId) return;
  try {
    const dayKey  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const docId   = `${bookId}_ch${chapterIndex}_${dayKey}`;
    const ref     = doc(db, 'chapter_analytics', docId);
    const email   = userEmail.toLowerCase();

    // setDoc with merge:true — creates on first read, increments on subsequent reads.
    // increment(1) adds to reads each time; arrayUnion dedupes the readers list.
    setDoc(ref, {
      bookId,
      bookTitle: bookTitle || '',
      chapter:   chapterIndex,
      date:      dayKey,
      reads:     increment(1),
      readers:   arrayUnion(email),
      readAt:    serverTimestamp(),
    }, { merge: true }).catch(() => {});
  } catch { /* non-blocking */ }
}

// ── Check scheduled releases ────────────────────────────────────────────────
/**
 * Called on app load (AppContext) and on schedule-panel save.
 * Reads chapter_schedules, finds items whose releaseDate has passed,
 * and marks the matching book chapters as released.
 *
 * @param {Function} saveBook - AppContext saveBook function
 * @param {Array}    books    - current books array
 * @returns {Promise<string[]>} list of bookIds that were auto-released
 */
export async function processScheduledReleases(saveBook, books) {
  if (!saveBook || !books?.length) return [];

  try {
    const snap = await getDoc(doc(db, 'site_data', 'chapter_schedules'));
    if (!snap.exists()) return [];

    const schedules = snap.data().schedules || [];
    const now       = Date.now();
    const released  = schedules.filter(s => !s.released && s.releaseDate <= now);
    if (!released.length) return [];

    const updated     = [];
    const updatedBookIds = new Set();

    for (const sched of released) {
      const book = books.find(b => b.id === sched.bookId);
      if (!book) continue;

      // Add this chapter index to the book's releasedTocIndices
      const cur     = Array.isArray(book.releasedTocIndices) ? book.releasedTocIndices : [];
      const already = cur.includes(sched.chapterNum);
      if (already) {
        // Mark released in schedule but no book update needed
        updated.push({ ...sched, released: true });
        continue;
      }

      const newIndices = [...cur, sched.chapterNum].sort((a, b) => a - b);
      await saveBook({
        ...book,
        releasedTocIndices: newIndices,
        chaptersReleased:   newIndices.length,
      });

      updated.push({ ...sched, released: true });
      updatedBookIds.add(sched.bookId);
    }

    if (updated.length) {
      // Persist the updated schedule flags back to Firestore
      const updatedSchedules = schedules.map(s => {
        const match = updated.find(u => u.bookId === s.bookId && u.chapterNum === s.chapterNum);
        return match ? { ...s, released: true } : s;
      });
      await setDoc(doc(db, 'site_data', 'chapter_schedules'),
        { schedules: updatedSchedules, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {});
    }

    return [...updatedBookIds];
  } catch (e) {
    console.warn('[ChapterAnalytics] processScheduledReleases failed:', e.message);
    return [];
  }
}

// ── Fetch chapter analytics for admin panel ─────────────────────────────────
/**
 * Returns aggregated read counts per chapter for a given book.
 * Used by the admin analytics panel.
 *
 * @param {string} bookId
 * @param {number} days  — how many days back to query (default 30)
 * @returns {Promise<Array<{chapter, date, reads, uniqueReaders}>>}
 */
export async function getChapterAnalytics(bookId, days = 30) {
  if (!bookId) return [];
  try {
    const { getDocs, collection, query, where } = await import('firebase/firestore');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Single-field where clause only — no compound orderBy (avoids needing a composite index)
    const q    = query(
      collection(db, 'chapter_analytics'),
      where('bookId', '==', bookId),
      where('date',   '>=', cutoffStr),
    );
    const snap = await getDocs(q);

    // Aggregate by chapter — count reads and unique readers per chapter
    const byChapter = {};
    snap.docs.forEach(d => {
      const { chapter, reads, readers } = d.data();
      if (chapter === undefined || chapter === null) return;
      if (!byChapter[chapter]) byChapter[chapter] = { reads: 0, readers: new Set() };
      // reads field is the total for that day; fallback to 1 for old docs
      byChapter[chapter].reads += (reads || 1);
      // readers is an array of unique emails for that day
      (Array.isArray(readers) ? readers : []).forEach(e => byChapter[chapter].readers.add(e));
    });

    // Sort by chapter number ascending (done in JS, no index needed)
    return Object.entries(byChapter)
      .map(([ch, v]) => ({
        chapter:       Number(ch),
        reads:         v.reads,
        uniqueReaders: v.readers.size,
      }))
      .sort((a, b) => a.chapter - b.chapter);
  } catch (e) {
    console.warn('[ChapterAnalytics] getChapterAnalytics failed:', e.message);
    return [];
  }
}
