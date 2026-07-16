/**
 * Reading Time Utilities
 * ─────────────────────────────────
 * Calculates reading time based on industry-standard word count methods
 * Used by platforms: Medium (275 WPM), Amazon Kindle (adaptive), Publishers (250 WPM)
 */

/**
 * Count exact words from an array of chapter objects.
 * Each chapter has a `text` string. Strips markdown/punctuation clusters,
 * splits on whitespace, and filters empty tokens.
 *
 * @param {Array} chapters - Array of { text: string, title: string, ... }
 * @returns {number} Total word count
 */
export function countWordsFromChapters(chapters) {
  if (!chapters || chapters.length === 0) return 0;
  return chapters.reduce((total, ch) => {
    const text = (ch.text || '') + ' ' + (ch.title || '') + ' ' + (ch.subtitle || '');
    const words = text
      .replace(/\s+/g, ' ')   // normalise whitespace
      .trim()
      .split(' ')
      .filter(w => w.length > 0);
    return total + words.length;
  }, 0);
}

/**
 * Calculate reading time from word count
 * Based on average adult silent reading speed
 * Industry standard: 238-275 WPM for non-fiction
 * We use 250 WPM as baseline (middle ground for fiction + non-fiction)
 *
 * @param {number} wordCount - Total words in the book
 * @param {Object} options - Optional settings
 * @param {number} options.wpm - Words per minute (default: 250)
 * @param {string} options.format - Return format: 'minutes' | 'readable' (default: 'readable')
 * @returns {string|number} Reading time
 */
export function calculateReadingTime(wordCount, options = {}) {
  const { wpm = 250, format = 'readable' } = options;

  if (!wordCount || wordCount <= 0) {
    return format === 'readable' ? '< 1 min' : 0;
  }

  const minutes = Math.ceil(wordCount / wpm);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (format === 'minutes') {
    return minutes;
  }

  // Readable format: "8–10 hrs", "45 mins", "30 mins"
  if (hours > 0) {
    const min = hours * 60 + (remainingMinutes - 15); // Start of range
    const max = hours * 60 + (remainingMinutes + 15); // End of range
    return `${Math.max(1, Math.floor(min / 60))}–${Math.ceil(max / 60)} hrs`;
  }

  return `${minutes} min${minutes !== 1 ? 's' : ''}`;
}

/**
 * Format a raw word count for display.
 * e.g. 62500 → "62,500" (exact), or "62.5k" (compact)
 *
 * @param {number} wordCount
 * @param {'exact'|'compact'} style
 * @returns {string}
 */
export function formatWordCount(wordCount, style = 'exact') {
  if (!wordCount || wordCount <= 0) return '—';
  if (style === 'compact') {
    if (wordCount >= 1000) return `${(wordCount / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(wordCount);
  }
  // 'exact' — locale-formatted with commas
  return wordCount.toLocaleString();
}

/**
 * Estimate word count from page count
 * Standard paperback: ~250-300 words per page
 * We use 250 as conservative estimate
 *
 * @param {number} pages - Number of pages
 * @returns {number} Estimated word count
 */
export function estimateWordCount(pages) {
  if (!pages || pages <= 0) return 0;
  return Math.round(pages * 250);
}

/**
 * Get reading time display (what to show on book card/detail)
 * Priority: live chapter word count > book.wordCount > pages > readTime field
 *
 * @param {Object} book - Book object
 * @param {Array|null} chapters - Live chapters array (optional, from Firestore)
 * @returns {string} Reading time display string
 */
export function getReadingTimeDisplay(book, chapters = null) {
  // Priority 1: Count from live chapters if available
  if (chapters && chapters.length > 0) {
    const wc = countWordsFromChapters(chapters);
    if (wc > 0) return calculateReadingTime(wc);
  }

  // Priority 2: Use provided wordCount
  if (book.wordCount && book.wordCount > 0) {
    return calculateReadingTime(book.wordCount);
  }

  // Priority 3: Estimate from pages
  if (book.pages && book.pages > 0) {
    const estimated = estimateWordCount(book.pages);
    return calculateReadingTime(estimated);
  }

  // Priority 4: Use pre-calculated readTime field
  if (book.readTime) {
    return book.readTime;
  }

  // Fallback: Generic message
  return 'Check length inside';
}

/**
 * Detailed reading stats for admin panel
 * Shows all calculated values and sources
 *
 * @param {Object} book - Book object
 * @param {Array|null} chapters - Live chapters (optional)
 * @returns {Object} Reading stats with all values
 */
export function getReadingStats(book, chapters = null) {
  const liveWc = chapters && chapters.length > 0 ? countWordsFromChapters(chapters) : 0;
  const wordCount = liveWc > 0 ? liveWc : book.wordCount;
  const estimatedFromPages = book.pages ? estimateWordCount(book.pages) : null;
  const display = getReadingTimeDisplay(book, chapters);

  return {
    wordCount,
    liveWordCount: liveWc || null,
    pages: book.pages || null,
    estimatedWordCount: estimatedFromPages,
    readingTime: display,
    minutesEstimate: calculateReadingTime(wordCount || estimatedFromPages, { format: 'minutes' }),
    source: liveWc > 0 ? 'live-chapters' : (wordCount ? 'provided' : (book.pages ? 'estimated' : 'none')),
  };
}

/**
 * Validate reading time format
 * Used for admin validation
 *
 * @param {string} readTime - Reading time string (e.g., "8–10 hrs")
 * @returns {boolean} Is valid format
 */
export function isValidReadingTimeFormat(readTime) {
  if (!readTime || typeof readTime !== 'string') return false;
  // Match patterns: "45 mins", "8–10 hrs", "2 hrs", etc.
  return /^\d+(\–\d+)?\s(min|hr)s?$/.test(readTime.trim());
}
