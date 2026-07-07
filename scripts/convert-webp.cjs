/**
 * Convert heavy public PNGs to WebP for faster loading.
 * Run once: node scripts/convert-webp.js
 */
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const PUBLIC = path.join(__dirname, '..', 'public');

// Images worth converting (skip tiny icons & SVGs)
const targets = [
  // Book covers (shown on every card/detail page)
  'cover-marriage-is-a-scam.png',
  'cover-pain.png',
  'cover-the-last-chapter.png',
  'cover-chasing-her-ghosts.png',
  'cover-19-days.png',
  // Author photos (large, loaded on About/Founder page)
  'mwangi.png',
  'mwangi2.png',
  'mwangi3.png',
  'mwangi4.png',
  'mwangi5.png',
  // Logos used in UI
  'logo.png',
  'logo-nobg.png',
  'logo-nobg2.png',
  'logo-nobg3.png',
  'logo-alone.png',
  'logo-rect.png',
  'logo-icon.png',
  // Misc
  'poster4.png',
  '19 days novel.png',
];

(async () => {
  let saved = 0;
  for (const file of targets) {
    const src  = path.join(PUBLIC, file);
    const dest = path.join(PUBLIC, file.replace(/\.png$/i, '.webp'));
    if (!fs.existsSync(src)) { console.log(`  skip (not found): ${file}`); continue; }
    if (fs.existsSync(dest)) { console.log(`  skip (exists):    ${file.replace('.png','.webp')}`); continue; }

    const beforeKB = Math.round(fs.statSync(src).size / 1024);
    await sharp(src).webp({ quality: 82 }).toFile(dest);
    const afterKB  = Math.round(fs.statSync(dest).size / 1024);
    const pct      = Math.round((1 - afterKB / beforeKB) * 100);
    console.log(`  ✓ ${file.padEnd(38)} ${beforeKB} KB → ${afterKB} KB  (-${pct}%)`);
    saved += beforeKB - afterKB;
  }
  console.log(`\nTotal saved: ~${saved} KB`);
})();
