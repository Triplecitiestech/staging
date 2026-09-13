import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // tsconfig has `jsx: preserve` (Next.js compiles JSX itself); vitest's
  // esbuild would otherwise emit classic `React.createElement` calls with no
  // React import and every .tsx component under test fails with
  // "React is not defined". Match Next's automatic runtime.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
