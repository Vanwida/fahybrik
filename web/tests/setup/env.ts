/**
 * Vitest setup: pin a dummy DATABASE_URL so module-level `sql = createClient()`
 * cannot target production, then refuse a TEST_DATABASE_URL that resolves to
 * the same host as the shell or root .env.local DATABASE_URL.
 *
 * Unit tests that import `@/lib/db` should NOT issue queries — they should mock
 * the client via {@link createFakeSql}. The postgres client is lazy about
 * connecting, so an unused dummy URL is safe.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DUMMY_DATABASE_URL,
  assertTestDatabaseNotProduction,
  parseDatabaseUrlFromEnvFile,
} from './prod-db-guard';

const inheritedDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = DUMMY_DATABASE_URL;

const envLocalPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env.local');
let envLocalDatabaseUrl: string | null = null;
let envLocalUnreadable = false;
try {
  envLocalDatabaseUrl = parseDatabaseUrlFromEnvFile(readFileSync(envLocalPath, 'utf8'));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
    envLocalUnreadable = true;
  }
}

assertTestDatabaseNotProduction({
  inheritedDatabaseUrl,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  envLocalDatabaseUrl,
  envLocalUnreadable,
});

// Route-handler suites (`*.db.test.ts` that import a real `app/api/**/route.ts`)
// read `@/lib/db`, which connects with DATABASE_URL. Their contract is "the
// runner points DATABASE_URL and TEST_DATABASE_URL at the same throwaway
// branch", but the dummy above overrode it unconditionally, so those suites could
// only ever reach the dummy host. Once the guard has accepted TEST_DATABASE_URL
// (it throws above otherwise), the app client follows it.
if (process.env.TEST_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL.trim();
}
