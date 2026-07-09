import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// ── Build stamp — shared across plugins ──────────────────────────────────────
const BUILD_STAMP = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

// ── Plugin 1: Stamp sw.js cache name on every build ──────────────────────────
// Ensures every device picks up the new service worker within 30s of deploy.
function stampServiceWorker() {
  return {
    name: 'stamp-sw',
    closeBundle() {
      const swDist = path.resolve('dist', 'sw.js');
      if (!fs.existsSync(swDist)) return;
      let src = fs.readFileSync(swDist, 'utf-8');
      // Replace both the CACHE_NAME and the BUILD_STAMP placeholder
      src = src.replace(
        /const CACHE_NAME\s*=\s*['"][^'"]*['"]/,
        `const CACHE_NAME = 'ellines-haven-${BUILD_STAMP}'`
      );
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
      // /sw.js?v=BUILD_STAMP forces browsers to re-fetch the SW on every deploy,
      // bypassing the browser's 24-hour SW update throttle.
      // Works because the browser treats /sw.js?v=AAA and /sw.js?v=BBB as different scripts.
      html = html.replace(
        /\/sw\.js(\?v=[\w]+)?/g,
        `/sw.js?v=${BUILD_STAMP}`
      );
      fs.writeFileSync(indexPath, html);
      console.log(`[stamp-public-assets] Stamped public asset URLs with ?v=${BUILD_STAMP}`);
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
