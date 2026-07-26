/**
 * Ping IndexNow (Bing/Yandex/etc.) + Google sitemap ping for Ellines Haven.
 * Run after deploy: node scripts/submit-indexing.mjs
 */
const ORIGIN = 'https://haven.ellines.co.ke';
const KEY = '1b9faca8a192e88f7c3d4e5b6a708192';
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;

const URLS = [
  `${ORIGIN}/`,
  `${ORIGIN}/library`,
  `${ORIGIN}/founder`,
  `${ORIGIN}/about`,
  `${ORIGIN}/contact`,
  `${ORIGIN}/faq`,
  `${ORIGIN}/privacy`,
  `${ORIGIN}/terms`,
  `${ORIGIN}/book/marriage-is-a-scam`,
  `${ORIGIN}/book/pain`,
  `${ORIGIN}/book/echoes-of-the-savanna`,
  `${ORIGIN}/book/seven-sunsets`,
  `${ORIGIN}/book/midnight-in-mombasa`,
  `${ORIGIN}/book/the-acacia-road`,
  `${ORIGIN}/book/children-of-thunder`,
  `${ORIGIN}/book/nairobi-nights`,
  `${ORIGIN}/book/chasing-ghosts-and-supercars`,
  `${ORIGIN}/book/19-days`,
  `${ORIGIN}/book/the-last-chapter`,
  `${ORIGIN}/book/letters-from-lamu`,
  `${ORIGIN}/book/the-nairobi-hustle`,
  `${ORIGIN}/book/roots-of-the-rift`,
];

async function submitIndexNow() {
  const body = {
    host: 'haven.ellines.co.ke',
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: URLS,
  };
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  console.log(`[IndexNow] ${res.status} ${res.statusText}`, text.slice(0, 200));
  return res.ok || res.status === 202;
}

async function pingGoogleSitemap() {
  const sitemap = encodeURIComponent(`${ORIGIN}/sitemap.xml`);
  const url = `https://www.google.com/ping?sitemap=${sitemap}`;
  const res = await fetch(url);
  console.log(`[Google sitemap ping] ${res.status} ${res.statusText}`);
  return res.ok;
}

async function pingBingSitemap() {
  const sitemap = encodeURIComponent(`${ORIGIN}/sitemap.xml`);
  const url = `https://www.bing.com/ping?sitemap=${sitemap}`;
  const res = await fetch(url);
  console.log(`[Bing sitemap ping] ${res.status} ${res.statusText}`);
  return res.ok;
}

const results = await Promise.allSettled([
  submitIndexNow(),
  pingGoogleSitemap(),
  pingBingSitemap(),
]);
console.log('Done:', results.map((r) => r.status === 'fulfilled' ? r.value : r.reason?.message || r.reason));
