import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,   // fail hard if 5173 is taken — never silently drift to 5174/5175
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Firebase — split into auth and the heavier firestore/app chunks
          if (id.includes('firebase/auth') || id.includes('@firebase/auth')) {
            return 'vendor-firebase-auth';
          }
          if (id.includes('firebase') || id.includes('@firebase')) {
            return 'vendor-firebase';
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
