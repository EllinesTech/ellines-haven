import { FALLBACK_CONTENT } from '../src/data/bookChapters.js';

const bookId = process.argv[2] || '1';
const chapters = FALLBACK_CONTENT[bookId] || [];
let total = 0;
chapters.forEach((ch, i) => {
  const text = [(ch.text||''), (ch.title||''), (ch.subtitle||''), (ch.part||'')].join(' ');
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  total += words;
  console.log(`Ch${String(i+1).padStart(2,'0')}: ${String(words).padStart(5)} words — ${ch.title||''}`);
});
console.log(`\nTotal chapters : ${chapters.length}`);
console.log(`Total words    : ${total.toLocaleString()} (${(total/1000).toFixed(1)}k)`);
console.log(`Est. pages     : ${Math.round(total/250)} (@ 250 words/page)`);
console.log(`Est. read time : ${(total/250/60).toFixed(1)} hrs (@ 250 wpm)`);
