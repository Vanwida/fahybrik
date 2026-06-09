/**
 * Real-database test helper — connects to a dedicated Neon **test branch**
 * (a copy-on-write clone of `main`), NOT to a scripted SQL mock.
 *
 * Why a real DB: M8 finding flagged the `createFakeSql` "scripted-array"
 * theatre — those tests never exercise real SQL (joins, casts, transactions,
 * constraints). The project rule (CLAUDE.md) is explicit: do NOT mock the
 * database; use a real Neon branch.
 *
 * Connection source (in priority order):
 *   1) TEST_DATABASE_URL  — preferred; a throwaway Neon branch
 *   2) <none>             — tests that need the DB are skipped EXPLICITLY
 *                           via `describeWithDb` so CI shows "skipped", never
 *                           a false green.
 *
 * The client mirrors the production `lib/db` config (same ssl, same bigint
 * type coercion) so code under test behaves identically to runtime.
 */

import postgres from 'postgres';
import type { Sql } from '@/lib/db';
import { describe } from 'vitest';

/** Same bigint coercion as `web/lib/db/index.ts` — keeps row shapes identical. */
const pgTypes = { bigint: postgres.BigInt } as const;

let cached: ReturnType<typeof postgres> | null = null;

export function getTestDbUrl(): string | null {
  const url = process.env.TEST_DATABASE_URL?.trim();
  return url && url.length > 0 ? url : null;
}

export function hasTestDb(): boolean {
  return getTestDbUrl() !== null;
}

function connect(): ReturnType<typeof postgres> {
  if (cached) return cached;
  const url = getTestDbUrl();
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Real-DB tests require a Neon test branch. ' +
        'See infra: create a branch and export TEST_DATABASE_URL.',
    );
  }
  cached = postgres(url, {
    ssl: 'require',
    // Single warm connection: a freshly-woken Neon branch endpoint resets
    // extra connections opened in a burst (ECONNRESET). One serial connection
    // is stable and these suites are not throughput-bound.
    max: 1,
    idle_timeout: 30,
    connect_timeout: 30,
    prepare: false,
    types: pgTypes,
  });
  return cached;
}

/**
 * Returns a real postgres client bound to the test branch — LAZILY. The actual
 * connection is only created on first use (tag invocation / `.begin`). This
 * matters because `describeWithDb` still *collects* (registers) skipped suites,
 * which runs the `const sql = getTestSql()` line at the top of the describe
 * body even when skipped. A lazy proxy means that line is a no-op when there's
 * no DB, so skipped suites don't throw at collection time.
 */
export function getTestSql(): Sql {
  const handler: ProxyHandler<(..._: unknown[]) => unknown> = {
    get(_t, prop) {
      const real = connect() as unknown as Record<string | symbol, unknown>;
      const value = real[prop];
      return typeof value === 'function' ? value.bind(real) : value;
    },
    apply(_t, _thisArg, args) {
      // Tagged-template invocation: sql`...`
      const real = connect() as unknown as (...a: unknown[]) => unknown;
      return real(...args);
    },
  };
  return new Proxy(function () {} as never, handler) as unknown as Sql;
}

export async function closeTestSql(): Promise<void> {
  if (cached) {
    await cached.end({ timeout: 5 });
    cached = null;
  }
}

/**
 * `describe` that runs only when a real test DB is configured. When it is not,
 * the suite is registered as SKIPPED with a loud reason — so the test report
 * shows "skipped (no TEST_DATABASE_URL)" instead of silently reporting green
 * while exercising nothing. This is the unit-test analogue of the Playwright
 * silent-skip fix.
 */
export const describeWithDb: typeof describe.skip = hasTestDb()
  ? describe
  : (describe.skip as typeof describe.skip);

if (!hasTestDb()) {
  // Surface the reason once, at collection time, so it is visible in CI logs
  // and developers never wonder why DB-backed suites "passed" without running.
  console.warn(
    '[test-db] TEST_DATABASE_URL not set — real-DB integration suites will be SKIPPED, not silently passed.',
  );
}
