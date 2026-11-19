import { defineConfig } from 'vitest/config'

// Tests d'intégration contre une base Supabase locale (`npx supabase start`).
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
