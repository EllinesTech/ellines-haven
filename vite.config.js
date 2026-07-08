import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// ── Plugin: stamp sw.js with a fresh build timestamp on every build ──────────
// This ensures mobile users always get the new service worker after a deploy.
function stampServiceWorker() {
  return {
    name: 'stamp-sw',
    closeBundle() {
      const swDist = path.resolve('dist', 'sw.js');
      if (!fs.existsSync(swDist)) return;
      let src = fs.readFileSync(swDist, 'utf-8');
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      // Replace the hardcoded cache name with a fresh timestamped one
      src = src.replace(
        /const CACHE_NAME\s*=\s*['"][^'"]*['"]/,
        `const CACHE_NAME = 'ellines-haven-${stamp}'`
      );
      fs.writeFileSync(swDist, src);
      console.log(`[stamp-sw] Cache name → ellines-haven-${stamp}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
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
          // Firebase — split auth away from the heavy SDK
          if (id.includes('firebase/auth') || id.includes('@firebase/auth')) {
            return 'vendor-firebase-auth';
          }
          if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) {
            return 'vendor-firebase-firestore';
          }
          if (id.includes('firebase/storage') || id.includes('@firebase/storage')) {
            return 'vendor-firebase-storage';
          }
          if (id.includes('firebase') || id.includes('@firebase')) {
            return 'vendor-firebase-core';
          }
          // React ecosystem
          if (id.includes('react-dom') || id.includes('react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
})
