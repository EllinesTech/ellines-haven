/**
 * Shared book-cover helpers — keep cards, founder page, home, and detail in sync.
 */

export function coverBasePath(src) {
  if (!src || typeof src !== 'string') return '';
  return src.split('#')[0].split('?')[0];
}

export function isPublicCoverPath(src) {
  return typeof src === 'string' && coverBasePath(src).startsWith('/cover-');
}

/** Remote admin upload (Storage / CDN) — not our packaged public cover files. */
export function isCustomRemoteCover(src) {
  if (!src || typeof src !== 'string') return false;
  if (!/^https?:\/\//i.test(src)) return false;
  return !coverBasePath(src).includes('/cover-');
}

export function isDataCover(src) {
  return typeof src === 'string' && src.startsWith('data:image');
}

function titlesMatch(a, b) {
  if (!a || !b) return false;
  return String(a).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    === String(b).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function hasImageCover(book) {
  const src = book?.cover;
  if (!src || typeof src !== 'string' || !src.trim()) return false;
  if (book.coverType === 'photo') return true;
  if (src.startsWith('data:image')) return true;
  return /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(src);
}

export function webpSrc(src) {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:') || !/\.png(\?|$)/i.test(src)) return null;
  return src.replace(/\.png(\?[^#]*)?/i, '.webp$1');
}

/**
 * Sync seed public covers only for the *same title*.
 * Never overwrite another book's cover (e.g. Room for You ≠ Acacia Road)
 * or custom data:/remote uploads.
 */
export function resolveCoverFields(defaults = {}, book = {}) {
  const seed = defaults.cover;
  const current = book.cover;
  const next = { ...book };
  const sameBook = titlesMatch(defaults.title, book.title);

  // Always keep custom uploads
  if (isDataCover(current) || isCustomRemoteCover(current)) {
    if (hasImageCover(next) && next.coverType !== 'photo') next.coverType = 'photo';
    return next;
  }

  // Different title at same id (catalogue replaced a seed book) — never steal seed cover
  if (!sameBook) {
    if (hasImageCover(next) && next.coverType !== 'photo') next.coverType = 'photo';
    return next;
  }

  // Same title: fill missing cover, or refresh cache-bust on the same public file
  if (typeof seed === 'string' && seed.startsWith('/cover-')) {
    if (!current || !String(current).trim()) {
      next.cover = seed;
      next.coverType = defaults.coverType || 'photo';
    } else if (isPublicCoverPath(current) && coverBasePath(current) === coverBasePath(seed)) {
      next.cover = seed;
      next.coverType = defaults.coverType || 'photo';
    }
  }

  if (hasImageCover(next) && next.coverType !== 'photo') {
    next.coverType = 'photo';
  }

  return next;
}

/** Pin landscape wrap-around jackets to the front (right) panel. */
export function onCoverImageLoad(e) {
  const img = e?.currentTarget;
  if (!img) return;
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w > h) img.style.objectPosition = 'right center';
}
