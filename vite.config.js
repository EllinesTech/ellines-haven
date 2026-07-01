import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
