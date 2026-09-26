import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts', 'lib/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.join(import.meta.dirname, 'src'),
    },
  },
})
