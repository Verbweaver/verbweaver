import { resolve } from 'path';

export default {
  main: {
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
} as const;