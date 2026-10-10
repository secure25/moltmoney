import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Load apps/api/.env so tests can reach the local (no-Docker) database.
    setupFiles: ['dotenv/config'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // DB-heavy integration suites flake under load with the 10s defaults
    // (whole-suite runs push 100+ s per file); 30s covers the worst hook.
    hookTimeout: 30_000,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts'],
    },
  },
});
