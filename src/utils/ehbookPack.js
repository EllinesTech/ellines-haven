/**
 * .ehbook — portable offline book packs for any modern browser.
 *
 * Download → saved in the user's Downloads/Files (survives clearing site data).
 * Import → restores chapters into IndexedDB offline library.
 *
 * Packs are AES-GCM encrypted and licensed to the buyer's email so a shared
 * file won't open under a different account.
 */

const MAGIC = 'EHBOOK';
const VERSION = 1;
const APP_PEPPER = 'ellines-haven-ehbook-v1';
const PBKDF2_ITERS = 120_000;

function enc() {
  return new TextEncoder();
}

function toB64(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

function sanitizeFilename(title = 'book') {
  return String(title)
    .replace(/[^\w\s\-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'ellines-haven-book';
}

async function deriveKey(email, saltBytes) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot create secure book packs. Try Chrome, Edge, Firefox, or Safari.');
  }
  const material = await crypto.subtle.importKey(
    'raw',
    enc().encode(`${String(email).toLowerCase().trim()}::${APP_PEPPER}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function normalizeChapters(chapters = []) {
  return (Array.isArray(chapters) ? chapters : []).map((ch) => ({
    title: ch.title || '',
    subtitle: ch.subtitle || '',
    part: ch.part || '',
    text: ch.text || '',
    endMessage: ch.endMessage || '',
  }));
}

/**
 * Build an encrypted .ehbook object (does not download).
 */
export async function buildEhbookPack(email, bookMeta, chapters) {
  const emailKey = String(email || '').toLowerCase().trim();
  if (!emailKey) throw new Error('Sign in to download a keep-forever pack.');
  const bookId = String(bookMeta?.id || bookMeta?.bookId || '');
  if (!bookId) throw new Error('Missing book id.');
  const normalized = normalizeChapters(chapters);
  if (!normalized.length) throw new Error('No chapters available to pack.');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(emailKey, salt);

  const inner = {
    bookId,
    title: bookMeta.title || '',
    author: bookMeta.author || '',
    cover: bookMeta.cover || '',
    slug: bookMeta.slug || '',
    chapters: normalized,
  };

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc().encode(JSON.stringify(inner))
  );

  return {
    magic: MAGIC,
    version: VERSION,
    licensedTo: emailKey,
    bookId,
    title: inner.title,
    author: inner.author,
    chapterCount: normalized.length,
    exportedAt: Date.now(),
    salt: toB64(salt),
    iv: toB64(iv),
    payload: toB64(cipherBuf),
  };
}

/**
 * Trigger a browser download of the .ehbook file.
 * Works in Chrome, Firefox, Safari, Edge, and mobile browsers.
 */
export async function downloadEhbookPack(email, bookMeta, chapters) {
  const pack = await buildEhbookPack(email, bookMeta, chapters);
  const blob = new Blob([JSON.stringify(pack)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(pack.title || 'book')}.ehbook`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
  return {
    ok: true,
    filename: a.download,
    chapterCount: pack.chapterCount,
  };
}

/**
 * Parse + decrypt a .ehbook File/Blob for the signed-in user.
 * Returns { bookId, title, author, cover, slug, chapters, chapterCount, exportedAt }
 */
export async function importEhbookPack(file, email) {
  const emailKey = String(email || '').toLowerCase().trim();
  if (!emailKey) throw new Error('Sign in to import a book pack.');
  if (!file) throw new Error('Choose an .ehbook file to import.');

  const name = (file.name || '').toLowerCase();
  if (name && !name.endsWith('.ehbook') && !name.endsWith('.json')) {
    // Still try — some mobiles rename downloads
  }

  let text;
  try {
    text = await file.text();
  } catch {
    throw new Error('Could not read that file. Try choosing it again.');
  }

  let pack;
  try {
    pack = JSON.parse(text);
  } catch {
    throw new Error('That file is not a valid Ellines Haven book pack.');
  }

  if (pack?.magic !== MAGIC || !pack?.payload || !pack?.salt || !pack?.iv) {
    throw new Error('That file is not a valid Ellines Haven book pack.');
  }
  if (Number(pack.version) > VERSION) {
    throw new Error('This pack needs a newer version of Ellines Haven. Update the site and try again.');
  }

  const licensed = String(pack.licensedTo || '').toLowerCase().trim();
  if (licensed && licensed !== emailKey) {
    throw new Error(`This pack is licensed to ${pack.licensedTo}. Sign in with that account to import it.`);
  }

  const key = await deriveKey(emailKey, fromB64(pack.salt));
  let plain;
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(pack.iv) },
      key,
      fromB64(pack.payload)
    );
    plain = JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    throw new Error('Could not unlock this pack. It may be damaged or licensed to another account.');
  }

  const chapters = normalizeChapters(plain.chapters);
  if (!chapters.length) throw new Error('This pack has no readable chapters.');

  return {
    bookId: String(plain.bookId || pack.bookId || ''),
    title: plain.title || pack.title || 'Untitled',
    author: plain.author || pack.author || '',
    cover: plain.cover || '',
    slug: plain.slug || '',
    chapters,
    chapterCount: chapters.length,
    exportedAt: pack.exportedAt || Date.now(),
  };
}

export function ehbookSupported() {
  return !!(globalThis.crypto?.subtle && typeof Blob !== 'undefined');
}
