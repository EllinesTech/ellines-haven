/**
 * Deploy dist/ to Cloudflare Pages from a clean staging dir.
 * Wrangler scans repo ./functions (Firebase) if run from project root — use .cf-deploy.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const stage = resolve(root, '.cf-deploy');

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
execSync(
  'npx wrangler pages deploy dist --project-name=ellines-haven --commit-dirty=true --branch=main',
  { cwd: stage, stdio: 'inherit' }
);
