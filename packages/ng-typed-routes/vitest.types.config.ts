import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'types',
    include: [],
    typecheck: {
      enabled: true,
      only: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.types-test.json',
    },
  },
});
