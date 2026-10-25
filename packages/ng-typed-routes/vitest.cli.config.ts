import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'cli',
    include: ['cli/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
