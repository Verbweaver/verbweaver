import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  // Place Vite's cache outside node_modules so Node's resolver can find workspace-hoisted deps
  cacheDir: path.resolve(__dirname, '.vite-cache'),
  plugins: [
    react()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@verbweaver/shared': path.resolve(__dirname, '../shared/src'),
      // Workaround Node 24 + tinyglobby ESM resolution by forcing CJS entry
      'tinyglobby': path.resolve(__dirname, '../node_modules/tinyglobby/dist/index.js'),
      // Prefer ESM entry for date-fns to satisfy Vite dep scan
      'date-fns': path.resolve(__dirname, '../node_modules/date-fns/esm'),
      // Explicitly resolve extend to root install
      'extend': path.resolve(__dirname, '../node_modules/extend/index.js')
    }
  },
  // Re-enable optimization so CJS deps (use-sync-external-store) are ESM-prebundled for dev
  optimizeDeps: {
    include: [
      'use-sync-external-store',
      'use-sync-external-store/shim/with-selector.js',
      'zustand',
      'zustand/vanilla'
    ]
  },
  css: {
    preprocessorOptions: {
      // Add any CSS preprocessing if needed
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  // Use default public directory so assets like favicon.svg are copied to dist root
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
}) 