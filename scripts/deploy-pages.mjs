/**
 * Deploy dist/ to Cloudflare Pages from a clean staging dir.
 * Wrangler scans repo ./functions (Firebase) if run from project root — use .cf-deploy.
 */
import { cpSync, mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const stage = resolve(root, '.cf-deploy');

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(resolve(root, 'dist'), resolve(stage, 'dist'), { recursive: true });
cpSync(resolve(root, 'pages-functions'), resolve(stage, 'functions'), { recursive: true });

const refs = execSync(
  `node -e "const h=require('fs').readFileSync('dist/index.html','utf8');const m=[...h.matchAll(/(?:src|href)=\\\"(\\/assets\\/[^\\\"]+\\.(?:js|css))\\\"/g)].map(x=>x[1]);console.log([...new Set(m)].join('\\n'));"`,
  { cwd: root, encoding: 'utf8' }
)
  .trim()
  .split('\n')
  .filter(Boolean);

for (const ref of refs) {
  const file = resolve(root, 'dist', ref.slice(1));
  if (!require('fs').existsSync(file)) {
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
