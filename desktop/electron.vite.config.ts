import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/main.ts')
      },
      outDir: 'dist/main',
      rollupOptions: {
        output: {
          format: 'cjs'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/preload.ts')
      },
      outDir: 'dist/preload',
      rollupOptions: {
        output: {
          format: 'cjs'
        }
      }
    }
  }
}); 