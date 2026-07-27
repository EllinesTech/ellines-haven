/**
 * Deploy dist/ to Cloudflare Pages from a clean staging dir.
 * Wrangler scans repo ./functions (Firebase) if run from project root — use .cf-deploy.
 *
 * CRITICAL: Never run two deploys back-to-back. Custom-domain HTML can flip to the
 * new build before every hashed /assets/* file is reachable on all PoPs → 404s and
 * CSS MIME errors (SPA/404.html fallback returns text/html).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const stage = resolve(root, '.cf-deploy');
const LIVE = 'https://haven.ellines.co.ke';

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(resolve(root, 'dist'), resolve(stage, 'dist'), { recursive: true });
cpSync(resolve(root, 'pages-functions'), resolve(stage, 'functions'), { recursive: true });

const html = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)]
  .map((m) => m[1])
  .filter((v, i, a) => a.indexOf(v) === i);

for (const ref of refs) {
  const file = resolve(root, 'dist', ref.slice(1));
  if (!existsSync(file)) {
    console.error(`Missing asset referenced by index.html: ${ref}`);
    process.exit(1);
  }
  console.log(`OK dist${ref}`);
}

console.log('\nDeploying…');
const deployOut = execSync(
  'npx wrangler pages deploy dist --project-name=ellines-haven --commit-dirty=true --branch=main',
  { cwd: stage, encoding: 'utf8' }
);
process.stdout.write(deployOut);

const deployUrl =
  (deployOut.match(/https:\/\/[a-z0-9]+\.ellines-haven\.pages\.dev/i) || [])[0] || '';
if (!deployUrl) {
  console.error('Could not parse deployment URL from wrangler output');
  process.exit(1);
}
console.log(`\nDeployment URL: ${deployUrl}`);

function expectType(ref, ct) {
  if (ref.endsWith('.css')) return /text\/css/i.test(ct || '');
  return /javascript|ecmascript/i.test(ct || '');
}

async function check(base, ref) {
  const res = await fetch(`${base.replace(/\/$/, '')}${ref}`, { cache: 'no-store' });
  const ct = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.subarray(0, 32).toString('utf8');
  const looksHtml = /text\/html/i.test(ct) || head.includes('<!');
  return {
    ok: res.status === 200 && expectType(ref, ct) && !looksHtml,
    status: res.status,
    ct,
    looksHtml,
    bytes: buf.length,
  };
}

async function waitAll(base, label) {
  const attempts = 12;
  for (let i = 1; i <= attempts; i++) {
    const results = [];
    for (const ref of refs) results.push({ ref, ...(await check(base, ref)) });
    const bad = results.filter((r) => !r.ok);
    if (!bad.length) {
      console.log(`✓ ${label}: all ${refs.length} assets OK`);
      return;
    }
    console.log(
      `… ${label} try ${i}/${attempts}: ${bad.map((b) => `${b.ref}→${b.status}/${b.ct}`).join('; ')}`
    );
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.error(`FAILED: ${label} still missing assets after deploy`);
  process.exit(1);
}

// Origin first (authoritative), then custom domain (CDN can lag).
await waitAll(deployUrl, 'ORIGIN');
await waitAll(LIVE, 'LIVE');

// Confirm live HTML matches this build's refs (no cross-deploy mix).
const liveHtml = await (await fetch(`${LIVE}/`, { cache: 'no-store' })).text();
for (const ref of refs) {
  if (!liveHtml.includes(ref)) {
    console.error(`LIVE index.html does not reference ${ref} — another deploy may have raced`);
    process.exit(1);
  }
}
console.log('✓ LIVE index.html references this build’s assets');
