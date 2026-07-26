/**
 * .ehbook — portable offline packs (anti-sharing).
 *
 * The downloaded file is encrypted ciphertext only.
 * The AES key is issued by Cloud Functions and stored server-side —
 * another person who receives the file cannot decrypt it.
 *
 * Unlock requires:
 *  1. Sign-in as the licensed account
 *  2. That account still owns the book in their library
 *  3. A successful call to issueEhbookImportKey
 *
 * Chapters are also watermarked with the licensee identity.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const MAGIC = 'EHBOOK';
const VERSION = 2;

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

function normalizeChapters(chapters = []) {
  return (Array.isArray(chapters) ? chapters : []).map((ch) => ({
    title: ch.title || '',
    subtitle: ch.subtitle || '',
    part: ch.part || '',
    text: ch.text || '',
    endMessage: ch.endMessage || '',
  }));
}

/** Invisible-to-casual-reader but clear ownership mark in the text body */
function watermarkChapters(chapters, email, displayName) {
  const who = displayName ? `${displayName} · ${email}` : email;
  const mark =
    `\n\n— Licensed to ${who} — Ellines Haven — Personal use only. ` +
    `Redistribution, copying, or sharing this pack is prohibited. —`;
  return chapters.map((ch) => {
    const text = ch.text || '';
    if (text.includes('Ellines Haven — Personal use only')) return ch;
    return { ...ch, text: text + mark };
  });
}

async function importAesKey(contentKeyB64, usages) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot open secure book packs. Try Chrome, Edge, Firefox, or Safari.');
  }
  return crypto.subtle.importKey(
    'raw',
    fromB64(contentKeyB64),
    { name: 'AES-GCM' },
    false,
    usages
  );
}

async function issueExportKey(email, bookId, title) {
  const fn = httpsCallable(functions, 'issueEhbookExportKey');
  const res = await fn({ email, bookId, title });
  const data = res.data || {};
  if (!data.keyId || !data.contentKeyB64) {
    throw new Error('Could not create a secure pack key. Please try again.');
  }
  return data;
}

async function issueImportKey(email, bookId, keyId) {
  const fn = httpsCallable(functions, 'issueEhbookImportKey');
  const res = await fn({ email, bookId, keyId });
  const data = res.data || {};
  if (!data.contentKeyB64) {
    throw new Error('Could not unlock this pack.');
  }
  return data;
}

function friendlyCallableError(err, fallback) {
  const raw = err?.message || '';
  const cleaned = raw
    .replace(/^Firebase:\s*/i, '')
    .replace(/\s*\([^)]*\)\.?$/, '')
    .trim();
  return cleaned || fallback;
}

/**
 * Build an encrypted .ehbook object (server-held key — not shareable).
 */
export async function buildEhbookPack(email, bookMeta, chapters, displayName = '') {
  const emailKey = String(email || '').toLowerCase().trim();
  if (!emailKey) throw new Error('Sign in to download a keep-forever pack.');
  const bookId = String(bookMeta?.id || bookMeta?.bookId || '');
  if (!bookId) throw new Error('Missing book id.');

  let normalized = normalizeChapters(chapters);
  if (!normalized.length) throw new Error('No chapters available to pack.');
  normalized = watermarkChapters(normalized, emailKey, displayName);

  let keyId;
  let contentKeyB64;
  try {
    const issued = await issueExportKey(emailKey, bookId, bookMeta.title || '');
    keyId = issued.keyId;
    contentKeyB64 = issued.contentKeyB64;
  } catch (e) {
    throw new Error(friendlyCallableError(e, 'Could not authorize this pack. Make sure you own the book and are online.'));
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(contentKeyB64, ['encrypt']);

  const inner = {
    bookId,
    title: bookMeta.title || '',
    author: bookMeta.author || '',
    cover: bookMeta.cover || '',
    slug: bookMeta.slug || '',
    licensedTo: emailKey,
    licensedName: displayName || '',
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
    keyId, // server license lookup — no key material in the file
    iv: toB64(iv),
    payload: toB64(cipherBuf),
    notice: 'Personal license. This file will not open for other accounts.',
  };
}

/**
 * Trigger a browser download of the .ehbook file.
 */
export async function downloadEhbookPack(email, bookMeta, chapters, displayName = '') {
  const pack = await buildEhbookPack(email, bookMeta, chapters, displayName);
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
 * Parse + decrypt a .ehbook for the signed-in owner (requires online unlock).
 */
export async function importEhbookPack(file, email) {
  const emailKey = String(email || '').toLowerCase().trim();
  if (!emailKey) throw new Error('Sign in to import a book pack.');
  if (!file) throw new Error('Choose an .ehbook file to import.');
  if (!navigator.onLine) {
    throw new Error('Import needs a short online check to unlock your personal license. Reconnect and try again.');
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

  if (pack?.magic !== MAGIC || !pack?.payload || !pack?.iv) {
    throw new Error('That file is not a valid Ellines Haven book pack.');
  }

  const ver = Number(pack.version || 0);
  if (ver < 2 || !pack.keyId) {
    throw new Error(
      'This pack is an old format and can’t be used (it was not anti-share protected). ' +
      'Open the book while signed in and tap Keep forever to download a new pack.'
    );
  }
  if (ver > VERSION) {
    throw new Error('This pack needs a newer version of Ellines Haven. Refresh the site and try again.');
  }

  const licensed = String(pack.licensedTo || '').toLowerCase().trim();
  if (!licensed || licensed !== emailKey) {
    throw new Error('This pack is licensed to another account and cannot be shared or opened here.');
  }

  const bookId = String(pack.bookId || '');
  let contentKeyB64;
  try {
    const issued = await issueImportKey(emailKey, bookId, pack.keyId);
    contentKeyB64 = issued.contentKeyB64;
  } catch (e) {
    throw new Error(
      friendlyCallableError(
        e,
        'Could not unlock this pack. It may belong to another account, or you no longer own this book.'
      )
    );
  }

  let plain;
  try {
    const key = await importAesKey(contentKeyB64, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(pack.iv) },
      key,
      fromB64(pack.payload)
    );
    plain = JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    throw new Error('Could not unlock this pack. It may be damaged.');
  }

  if (String(plain.licensedTo || '').toLowerCase() !== emailKey) {
    throw new Error('This pack is licensed to another account and cannot be shared.');
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
