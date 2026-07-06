// Convert a book title to a URL slug
// "19 Days" → "19-days"
// "Marriage Is a Scam" → "marriage-is-a-scam"
export function slugify(title = '') {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // remove special chars except spaces and hyphens
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-|-$/g, '');          // trim leading/trailing hyphens
}

// Find a book from the books array by either its numeric id OR its title slug
// Returns undefined if not found
export function findBookBySlugOrId(books, slugOrId) {
  if (!books || !slugOrId) return undefined;
  // Try exact id match first
  const byId = books.find(b => String(b.id) === String(slugOrId));
  if (byId) return byId;
  // Try slug match
  return books.find(b => slugify(b.title) === slugOrId);
}

// Get the slug URL for a book
export function bookPath(book) {
  return `/book/${slugify(book.title)}`;
}

export function readPath(book) {
  return `/read/${slugify(book.title)}`;
}
