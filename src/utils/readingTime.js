/**
 * Reading Time Utilities
 * ─────────────────────────────────
 * Calculates reading time based on industry-standard word count methods
 * Used by platforms: Medium (275 WPM), Amazon Kindle (adaptive), Publishers (250 WPM)
 */

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
 * If wordCount available: use it
 * If pages available: estimate from pages
 * Fallback to readTime field or estimate
 * 
 * @param {Object} book - Book object
 * @returns {string} Reading time display string
 */
export function getReadingTimeDisplay(book) {
  // Priority 1: Use provided wordCount
  if (book.wordCount && book.wordCount > 0) {
    return calculateReadingTime(book.wordCount);
  }

  // Priority 2: Estimate from pages
  if (book.pages && book.pages > 0) {
    const estimated = estimateWordCount(book.pages);
    return calculateReadingTime(estimated);
  }

  // Priority 3: Use pre-calculated readTime field
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
 * @returns {Object} Reading stats with all values
 */
export function getReadingStats(book) {
  const wordCount = book.wordCount;
  const estimatedFromPages = book.pages ? estimateWordCount(book.pages) : null;
  const display = getReadingTimeDisplay(book);

  return {
    wordCount,
    pages: book.pages || null,
    estimatedWordCount: estimatedFromPages,
    readingTime: display,
    minutesEstimate: calculateReadingTime(wordCount || estimatedFromPages, { format: 'minutes' }),
    source: wordCount ? 'actual' : (book.pages ? 'estimated' : 'provided'),
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
