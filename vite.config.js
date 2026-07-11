import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// ── Build stamp — shared across plugins ──────────────────────────────────────
const BUILD_STAMP = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');

// ── Plugin 1: Stamp sw.js cache name on every build ──────────────────────────
// The SW is now a kill-switch that unregisters itself — no cache name needed.
// This plugin is kept to avoid breaking vite.config but does nothing useful.
function stampServiceWorker() {
  return {
    name: 'stamp-sw',
    closeBundle() {
      const swDist = path.resolve('dist', 'sw.js');
      if (!fs.existsSync(swDist)) return;
      // Only replace BUILD_STAMP placeholder if present (kill-switch SW has none)
      let src = fs.readFileSync(swDist, 'utf-8');
      src = src.replace(/BUILD_STAMP/g, BUILD_STAMP);
      fs.writeFileSync(swDist, src);
      console.log(`[stamp-sw] Cache name → ellines-haven-${BUILD_STAMP}`);
    },
  };
}

// ── Plugin 2: Inject BUILD_STAMP into index.html for image cache-busting ─────
// Replaces every ?v=XXXXXXXX in the built index.html with the current stamp.
// This means logo, favicon, og-image URLs in <head> are always fresh.
function stampPublicAssets() {
  return {
    name: 'stamp-public-assets',
    closeBundle() {
      const indexPath = path.resolve('dist', 'index.html');
      if (!fs.existsSync(indexPath)) return;
      let html = fs.readFileSync(indexPath, 'utf-8');
      // Replace any existing ?v= params on public asset refs
      html = html.replace(/\?v=\d{8,}/g, `?v=${BUILD_STAMP}`);
      // Also add ?v= to any logo/icon/og refs that don't have it yet
      html = html.replace(
        /(href|src)="(\/(?:logo|pwa|og-image|favicon)[^"]*\.(?:png|webp|svg|ico))"/g,
        (_, attr, url) => {
          const base = url.split('?')[0];
          return `${attr}="${base}?v=${BUILD_STAMP}"`;
        }
      );
      // ── Stamp the SW registration URL ──────────────────────────────────────
      html = html.replace(
        /\/sw\.js(\?v=[\w]+)?/g,
        `/sw.js?v=${BUILD_STAMP}`
      );
      // ── Inject unique build stamp comment so Cloudflare always serves fresh index.html ──
      html = html.replace(
        '</head>',
        `<!-- build:${BUILD_STAMP} -->\n  </head>`
      );
      fs.writeFileSync(indexPath, html);
      console.log(`[stamp-public-assets] Stamped public asset URLs with ?v=${BUILD_STAMP}`);

      // ── Stamp version.json — lets the app poll for new deploys ─────────────
      const versionPath = path.resolve('dist', 'version.json');
      fs.writeFileSync(versionPath, JSON.stringify({ v: BUILD_STAMP, built: new Date().toISOString() }));
      console.log(`[stamp-version] version.json → ${BUILD_STAMP}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker(), stampPublicAssets()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    minify: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('firebase/auth') || id.includes('@firebase/auth'))
            return 'vendor-firebase-auth';
          if (id.includes('firebase/firestore') || id.includes('@firebase/firestore'))
            return 'vendor-firebase-firestore';
          if (id.includes('firebase/storage') || id.includes('@firebase/storage'))
            return 'vendor-firebase-storage';
          if (id.includes('firebase') || id.includes('@firebase'))
            return 'vendor-firebase-core';
          if (id.includes('react-dom') || id.includes('react-router'))
            return 'vendor-react';
          if (id.includes('node_modules'))
            return 'vendor';
        },
      },
    },
  },
})
