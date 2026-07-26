/**
 * Convert a book title to a URL-friendly slug
 * Examples: "Marriage Is a Scam" → "marriage-is-a-scam", "19 Days" → "19-days"
 */
export function titleToSlug(title) {
  if (!title) return '';
  
  return title
    .toLowerCase()
    .trim()
    .replace(/[àáâäæ]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôöœ]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Get the slug for a book object
 */
export function getBookSlug(book) {
  return titleToSlug(book?.title || '');
}

/**
 * Generate book detail URL using book slug
 * Falls back to numeric ID if book has no title
 */
export function bookPath(book) {
  if (!book) return '/book/unknown';
  const slug = getBookSlug(book);
  return slug ? `/book/${slug}` : `/book/${book.id}`;
}

/**
 * Generate reader URL using book slug
 * Falls back to numeric ID if book has no title
 */
export function readPath(book) {
  if (!book) return '/read/unknown';
  const slug = getBookSlug(book);
  return slug ? `/read/${slug}` : `/read/${book.id}`;
}

/**
 * Find a book by slug or numeric ID
 * Used by Reader and BookDetail components to resolve URL params
 */
export function findBookBySlugOrId(books, slugOrId) {
  if (!slugOrId || !books) return null;

  const needle = String(slugOrId);

  // Try ID first (coerce so number/string ids both match)
  let book = books.find(b => String(b.id) === needle);
  if (book) return book;

  // Try slug match
  book = books.find(b => getBookSlug(b) === needle);
  return book || null;
}
