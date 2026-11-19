import { resolve } from 'path';

export default {
  main: {
    resolve: {
      // Bundle shared from source, as the frontend does. Its CommonJS dist re-exports via
      // `export *`, which rollup can't resolve to named imports.
      alias: {
        '@verbweaver/shared': resolve(__dirname, '../shared/src')
      }
    },
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