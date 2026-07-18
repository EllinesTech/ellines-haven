/**
 * Book Metrics Utilities
 * ─────────────────────────────────
 * Analytics for tracking most-read books, reader engagement, etc.
 * Aggregates data from chapter analytics and reading progress
 */

import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get all books sorted by total read count (most-read books)
 *
 * @param {Array} books - Array of book objects
 * @param {number} days - Filter to last N days (0 = all time)
 * @param {number} limit - Max results to return (default: 10)
 * @returns {Promise<Array>} Books sorted by read count with engagement metrics
 */
export async function getMostReadBooks(books, days = 30, limit = 10) {
  if (!books || !Array.isArray(books)) return [];

  try {
    const metricsMap = {};

    // Fetch chapter analytics for each book
    for (const book of books) {
      if (!book.id) continue;

      try {
        const analyticsRef = doc(db, 'chapter_analytics', String(book.id));
        const snap = await getDoc(analyticsRef);

        if (snap.exists()) {
          const data = snap.data();
          const chapters = data.chapters || {};
          let totalReads = 0;
          let uniqueReaders = new Set();

          // Aggregate chapter data
          Object.values(chapters).forEach(chapterData => {
            if (!chapterData.reads) return;

            // Filter by date if requested
            if (days > 0 && chapterData.reads) {
              const filtered = chapterData.reads.filter(r => {
                const readTime = r.timestamp?.toMillis?.() || r.timestamp || 0;
                const daysSince = (Date.now() - readTime) / (1000 * 60 * 60 * 24);
                return daysSince <= days;
              });
              totalReads += filtered.length;
              filtered.forEach(r => {
                if (r.userId) uniqueReaders.add(r.userId);
              });
            } else {
              totalReads += chapterData.reads.length;
              chapterData.reads.forEach(r => {
                if (r.userId) uniqueReaders.add(r.userId);
              });
            }
          });

          if (totalReads > 0) {
            metricsMap[book.id] = {
              bookId: book.id,
              title: book.title || '—',
              author: book.author || '—',
              totalReads,
              uniqueReaders: uniqueReaders.size,
              engagementScore: Math.round(
                (totalReads / 100) * (uniqueReaders.size / 10)
              ), // weighted formula
            };
          }
        }
      } catch (e) {
        console.warn(`[Metrics] Failed to fetch analytics for book ${book.id}:`, e);
      }
    }

    // Sort by total reads and return top N
    return Object.values(metricsMap)
      .sort((a, b) => b.totalReads - a.totalReads)
      .slice(0, limit);
  } catch (e) {
    console.error('[Metrics] getMostReadBooks failed:', e);
    return [];
  }
}

/**
 * Get user's average reading time (across all books)
 *
 * @param {string} userEmail - User email
 * @param {Object} readingStats - Reading stats object from getAllReadingStats()
 * @returns {Object} Statistics object with average, median, etc.
 */
export function getUserAverageReadingTime(userEmail, readingStats) {
  if (!readingStats || Object.keys(readingStats).length === 0) {
    return {
      avgMinutesPerSession: 0,
      totalMinutes: 0,
      totalSessions: 0,
      booksRead: 0,
    };
  }

  // Estimate time spent per book based on chapter position
  // This is a rough estimate since we only store chapter + scroll position
  const sessions = Object.values(readingStats).filter(s => s.chapter > 0 || s.scrollPct > 0);

  const totalSessions = sessions.length;
  if (totalSessions === 0) {
    return {
      avgMinutesPerSession: 0,
      totalMinutes: 0,
      totalSessions: 0,
      booksRead: 0,
    };
  }

  // Rough estimate: average ~30 min per chapter based on typical book lengths
  const estimatedMinutesPerChapter = 30;
  const totalMinutes = sessions.reduce((sum, s) => {
    const chapterTime = s.chapter * estimatedMinutesPerChapter;
    const scrollBonus = Math.round((s.scrollPct || 0) * estimatedMinutesPerChapter * 0.1);
    return sum + chapterTime + scrollBonus;
  }, 0);

  return {
    avgMinutesPerSession: Math.round(totalMinutes / totalSessions),
    totalMinutes,
    totalSessions,
    booksRead: sessions.filter(s => s.chapter > 10).length, // "completed" = 10+ chapters
  };
}

/**
 * Get platform-wide reading statistics
 *
 * @returns {Promise<Object>} Platform stats
 */
export async function getPlatformReadingStats() {
  try {
    const statsRef = doc(db, 'site_data', 'reading_stats');
    const snap = await getDoc(statsRef);

    if (snap.exists()) {
      return snap.data();
    }

    return {
      totalReads: 0,
      totalUniqueReaders: 0,
      avgReadingTime: 0,
      mostReadBook: null,
      lastUpdated: null,
    };
  } catch (e) {
    console.error('[Metrics] getPlatformReadingStats failed:', e);
    return null;
  }
}

/**
 * Get per-chapter word count breakdown
 * Useful for admin panel chapter visualization
 *
 * @param {Array} chapters - Array of chapter objects with text
 * @returns {Array} Chapters with word count information
 */
export function getChapterWordCountBreakdown(chapters) {
  if (!chapters || !Array.isArray(chapters)) return [];

  return chapters.map((ch, idx) => ({
    chapterIndex: idx,
    title: ch.title || `Chapter ${idx + 1}`,
    wordCount: countWordsInChapter(ch),
    percentOfTotal: 0, // will be calculated below
  })).map(ch => ({
    ...ch,
    percentOfTotal: Math.round(
      (ch.wordCount / chapters.reduce((sum, c) => sum + countWordsInChapter(c), 1)) * 100
    ),
  }));
}

/**
 * Helper: count words in a single chapter
 *
 * @param {Object} chapter - Chapter object
 * @returns {number} Word count
 */
function countWordsInChapter(chapter) {
  if (!chapter) return 0;
  const text = (chapter.text || '') + ' ' + (chapter.title || '') + ' ' + (chapter.subtitle || '');
  return text
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}

/**
 * Calculate book completion rates from chapter analytics
 *
 * @param {Object} analyticsData - Chapter analytics object from Firestore
 * @returns {Object} Completion metrics
 */
export function calculateCompletionMetrics(analyticsData) {
  if (!analyticsData || !analyticsData.chapters) {
    return { completionRate: 0, dropOffChapter: null, avgChaptersRead: 0 };
  }

  const chapters = Object.entries(analyticsData.chapters).sort(
    ([keyA], [keyB]) => parseInt(keyA) - parseInt(keyB)
  );

  if (chapters.length === 0) {
    return { completionRate: 0, dropOffChapter: null, avgChaptersRead: 0 };
  }

  const [firstKey, firstChapter] = chapters[0];
  const firstReads = firstChapter.reads?.length || 0;

  // Find where drop-off is highest
  let maxDropOff = 0;
  let dropOffChapter = null;

  for (let i = 1; i < chapters.length; i++) {
    const prevReads = chapters[i - 1][1].reads?.length || 0;
    const currReads = chapters[i][1].reads?.length || 0;
    const dropOff = prevReads - currReads;
    if (dropOff > maxDropOff) {
      maxDropOff = dropOff;
      dropOffChapter = i;
    }
  }

  const lastChapter = chapters[chapters.length - 1];
  const lastReads = lastChapter[1].reads?.length || 0;
  const completionRate = firstReads > 0 ? Math.round((lastReads / firstReads) * 100) : 0;

  return {
    completionRate,
    dropOffChapter,
    maxDropOff,
    avgChaptersRead: Math.round(chapters.length * (completionRate / 100)),
  };
}
