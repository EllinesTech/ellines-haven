/**
 * sync-chapters.mjs
 * ─────────────────
 * Two-way sync between Firestore (book_chapters collection)
 * and src/data/bookChapters.js
 *
 * Usage:
 *   node sync-chapters.mjs pull   ← Firestore → local  (default, after admin updates)
 *   node sync-chapters.mjs push   ← local → Firestore  (after editing locally)
 *   node sync-chapters.mjs        ← same as pull
 */

import { initializeApp }                              from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { writeFileSync, readFileSync, existsSync }    from 'fs';
import { fileURLToPath }                              from 'url';
import { dirname, join }                              from 'path';
import { createRequire }                              from 'module';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, 'src', 'data', 'bookChapters.js');
const jsonCache  = join(__dirname, '.chapters-cache.json');  // hidden JSON mirror

const firebaseConfig = {
  apiKey:            "AIzaSyAM-BhM2HQAZype3OU6nwH_ldzA6tf6yTg",
  authDomain:        "ellines-haven-web.firebaseapp.com",
  projectId:         "ellines-haven-web",
  storageBucket:     "ellines-haven-web.firebasestorage.app",
  messagingSenderId: "733742563669",
  appId:             "1:733742563669:web:08df2b624292b7c49aefdc",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ─── PULL: Firestore → local ─────────────────────────────────────────────────

async function pull() {
  console.log('📥  PULL: Firestore → bookChapters.js\n');

  const snapshot = await getDocs(collection(db, 'book_chapters'));

  if (snapshot.empty) {
    console.log('⚠️   No documents found in book_chapters.');
    process.exit(0);
  }

  const fallbackContent = {};
  const summary = [];

  snapshot.forEach(docSnap => {
    const bookId   = docSnap.id;
    const chapters = docSnap.data().chapters || [];
    fallbackContent[bookId] = chapters;
    summary.push(`  Book "${bookId}" — ${chapters.length} chapter(s)`);
    console.log(`  ✅ Book ${bookId}: ${chapters.length} chapter(s)`);
  });

  // Save a clean JSON mirror (used by push to read back reliably)
  writeFileSync(jsonCache, JSON.stringify(fallbackContent, null, 2), 'utf8');

  // Write the JS file
  writeLocalFile(fallbackContent, summary);

  console.log(`\n✅  Pull complete. ${Object.keys(fallbackContent).length} books synced.`);
  process.exit(0);
}

// ─── PUSH: local → Firestore ─────────────────────────────────────────────────

async function push() {
  console.log('📤  PUSH: bookChapters.js → Firestore\n');

  // Strategy: use the JSON cache if it exists (created by last pull).
  // If not, dynamically import the JS module to get FALLBACK_CONTENT directly.
  let fallbackContent;

  if (existsSync(jsonCache)) {
    // Fast path — read the clean JSON mirror
    fallbackContent = JSON.parse(readFileSync(jsonCache, 'utf8'));
    console.log('  📄 Reading from .chapters-cache.json\n');
  } else if (existsSync(outputPath)) {
    // Fallback — import the JS module
    console.log('  📄 No cache found. Importing bookChapters.js directly...\n');
    try {
      const mod = await import(`${outputPath}?t=${Date.now()}`);
      fallbackContent = mod.FALLBACK_CONTENT;
    } catch (e) {
      console.error('❌  Could not import bookChapters.js:', e.message);
      console.error('    Run "node sync-chapters.mjs pull" first to create the cache.');
      process.exit(1);
    }
  } else {
    console.error('❌  bookChapters.js not found. Run pull first.');
    process.exit(1);
  }

  const bookIds = Object.keys(fallbackContent);
  console.log(`  Found ${bookIds.length} book(s) to push.\n`);

  for (const bookId of bookIds) {
    const chapters = fallbackContent[bookId];
    const ref = doc(db, 'book_chapters', bookId);
    await setDoc(ref, { chapters }, { merge: true });
    console.log(`  ✅ Pushed Book ${bookId}: ${chapters.length} chapter(s)`);
  }

  // Update the JSON cache to match what we just pushed
  writeFileSync(jsonCache, JSON.stringify(fallbackContent, null, 2), 'utf8');

  console.log(`\n✅  Push complete. ${bookIds.length} books written to Firestore.`);
  process.exit(0);
}

// ─── Write local JS file ──────────────────────────────────────────────────────

function writeLocalFile(fallbackContent, summary) {
  // Use JSON.stringify for reliable serialisation, then unquote simple keys
  const contentStr = JSON.stringify(fallbackContent, null, 2)
    .replace(/"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, '$1:');

  const fileContent = `/**
 * bookChapters.js — AUTO-SYNCED WITH FIRESTORE
 * ─────────────────────────────────────────────
 * Keep in sync using:
 *   node sync-chapters.mjs pull   ← Firestore → local  (after admin updates)
 *   node sync-chapters.mjs push   ← local → Firestore  (after editing here)
 *
 * Last synced: ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} (EAT)
 *
 * Books synced:
${summary.map(s => ' *' + s).join('\n')}
 */

/**
 * Fallback chapter content — served instantly before the Firestore
 * live snapshot arrives, and when the user is offline.
 *
 * Priority in Reader.jsx:
 *   1. liveChapters   (real-time Firestore onSnapshot)
 *   2. offlineChapters (IndexedDB cache)
 *   3. FALLBACK_CONTENT[book.id]  ← this file
 *   4. Generic placeholder
 */
export const FALLBACK_CONTENT = ${contentStr};

/**
 * Get chapters for a book — prefer admin-uploaded chapters, then
 * synced fallback content, then a generic placeholder.
 */
export function getFallbackChapters(book) {
  // 1. Chapters stored directly on the book object (admin upload)
  if (book?.chapters && book.chapters.length > 0) {
    return book.chapters;
  }
  // 2. Synced fallback (this file mirrors Firestore)
  if (FALLBACK_CONTENT[book?.id]) {
    return FALLBACK_CONTENT[book.id];
  }
  // 3. Generic placeholder
  return [
    {
      title: 'Chapter 1',
      text: \`This is a work by Elijah Mwangi M, published exclusively through Ellines Haven.\\n\\nThank you for purchasing this book. The full content will be available to read here once uploaded by the author.\\n\\nIf you have any questions, contact us via WhatsApp: 0748 255 466.\`,
    },
  ];
}
`;

  writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`\n  📄 Written: ${outputPath}`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const mode = process.argv[2] || 'pull';

if (mode === 'push') {
  push().catch(e => { console.error('❌', e.message); process.exit(1); });
} else if (mode === 'pull') {
  pull().catch(e => { console.error('❌', e.message); process.exit(1); });
} else {
  console.error(`❌  Unknown mode: "${mode}". Use "pull" or "push".`);
  process.exit(1);
}
