/**
 * Smoke-test Listen mode against local Vite.
 * Usage: node scripts/smoke-listen.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/components/AudioPlayer.jsx'), 'utf8');

// Static guards (catch the exact crash we shipped)
if (src.includes('defaultPanelPos')) {
  console.error('FAIL: stale name defaultPanelPos still referenced');
  process.exit(1);
}
if (!src.includes('function defaultDockPos')) {
  console.error('FAIL: defaultDockPos function missing');
  process.exit(1);
}
const calls = (src.match(/\bdefaultDockPos\s*\(/g) || []).length;
if (calls < 2) {
  console.error('FAIL: defaultDockPos not used enough');
  process.exit(1);
}
if (/\bshowCfg\b/.test(src)) {
  console.error('FAIL: showCfg still referenced');
  process.exit(1);
}
console.log('PASS: AudioPlayer static checks (defaultDockPos / no showCfg)');

const BASE = process.env.SMOKE_BASE || 'http://localhost:5173';
const URL = `${BASE}/read/pieces-of-rebecca`;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    try {
      const require = createRequire(import.meta.url);
      return require('playwright');
    } catch {
      return null;
    }
  }
}

const pw = await loadPlaywright();
if (!pw) {
  console.log('SKIP: playwright not installed — static checks only');
  process.exit(0);
}

const { chromium, firefox, webkit } = pw;
const browsers = [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
];

let failed = 0;

for (const [name, browserType] of browsers) {
  let browser;
  try {
    browser = await browserType.launch({ headless: true });
  } catch (e) {
    console.log(`SKIP: ${name} not available (${e.message.split('\n')[0]})`);
    continue;
  }

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);

    const listenBtn = page.locator('button.reader__mode-btn--listen, button:has-text("Listen")').first();
    await listenBtn.waitFor({ state: 'visible', timeout: 20000 });
    await listenBtn.click();
    await page.waitForTimeout(1200);

    const dockVisible = await page.locator('.audio-float').first().isVisible().catch(() => false);
    const crashed = await page.locator('text=Something went wrong').count();
    const fatal = pageErrors.filter((e) =>
      /ReferenceError|TypeError|defaultDockPos|showCfg|is not defined/i.test(e)
    );

    if (!dockVisible || crashed > 0 || fatal.length) {
      console.error(`FAIL [${name}]: dockVisible=${dockVisible} crashed=${crashed}`);
      console.error(fatal.slice(0, 6));
      await page.screenshot({ path: path.join(root, `scripts/smoke-listen-${name}.png`) }).catch(() => {});
      failed += 1;
    } else {
      console.log(`PASS [${name}]: floating listen dock visible`);
    }
  } catch (e) {
    console.error(`FAIL [${name}]:`, e.message);
    failed += 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

process.exit(failed ? 1 : 0);
