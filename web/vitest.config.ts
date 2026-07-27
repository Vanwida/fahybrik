import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // `tests/**` holds the cross-cutting suites; `lib/**` lets engine modules
    // keep their unit tests co-located (e.g. the attention signal evaluators).
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // The `.db.test.ts` suites talk to a REAL Neon branch over the network, on a
    // deliberately single serial connection (tests/utils/test-db.ts pins `max: 1`
    // because a freshly-woken endpoint resets connections opened in a burst). A
    // suite that inserts a fixture and reads it back is therefore dozens of
    // round-trips deep, and vitest's 5 s default is a local-only assumption — the
    // helper already budgets 30 s just to CONNECT. Matching it here stops honest
    // suites from failing on latency instead of on behaviour. Pure unit tests
    // finish in milliseconds and are unaffected.
    testTimeout: 30_000,
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
