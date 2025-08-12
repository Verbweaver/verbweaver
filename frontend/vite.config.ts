import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@verbweaver/shared': path.resolve(__dirname, '../shared/src'),
      'fc-core-css': path.resolve(__dirname, 'node_modules/@fullcalendar/core/dist/index.css'),
      'fc-daygrid-css': path.resolve(__dirname, 'node_modules/@fullcalendar/daygrid/dist/index.css')
    }
  },
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