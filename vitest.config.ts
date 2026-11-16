import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/*',
      // Hilfsskripte im Wurzelverzeichnis (z. B. `pnpm play`, CHAOS-42).
      { test: { name: 'scripts', include: ['scripts/**/*.test.mjs'], environment: 'node' } },
    ],
  },
});
