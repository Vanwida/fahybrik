import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    setupFiles: [resolve(__dirname, 'tests/setup/env.ts')],
  },
  resolve: {
    alias: [
      // `server-only` is a Next.js sentinel that throws when imported outside a
      // Server Component. Node-based tests have no client boundary, so stub it.
      { find: 'server-only', replacement: resolve(__dirname, 'tests/_stubs/server-only.ts') },
      { find: '@', replacement: resolve(__dirname, '.') },
    ],
  },
});
