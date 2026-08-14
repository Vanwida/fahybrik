import { describe, expect, test } from 'vitest';
import {
  DUMMY_DATABASE_URL,
  PROD_TEST_DB_MESSAGE,
  UNPARSEABLE_PROD_DB_MESSAGE,
  UNPARSEABLE_TEST_DB_MESSAGE,
  UNREADABLE_ENV_LOCAL_MESSAGE,
  assertTestDatabaseNotProduction,
  extractPgHost,
  parseDatabaseUrlFromEnvFile,
} from './prod-db-guard';

const PROD =
  'postgres://prod-user:s3cret-pass@ep-main.example.invalid/neondb?sslmode=require';
const BRANCH =
  'postgres://test-user:other-pass@ep-branch.example.invalid/neondb?sslmode=require';

function expectSafeThrow(fn: () => void, message: string): void {
  try {
    fn();
    throw new Error('expected assertTestDatabaseNotProduction to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    const text = err instanceof Error ? err.message : String(err);
    expect(text).toBe(message);
    expect(text).not.toContain('s3cret-pass');
    expect(text).not.toContain('prod-user');
    expect(text).not.toContain('other-pass');
    expect(text).not.toContain(PROD);
    expect(text).not.toContain(BRANCH);
    expect(text).not.toContain('ep-main.example.invalid');
    expect(text).not.toContain('ep-branch.example.invalid');
  }
}

describe('extractPgHost', () => {
  test('reads host:port from a postgres URL', () => {
    expect(extractPgHost('postgres://u:p@db.example:5432/app')).toBe('db.example:5432');
  });

  test('reads host from postgresql:// with a query string', () => {
    expect(
      extractPgHost('postgresql://u:p@ep-x.example.invalid/neondb?sslmode=require'),
    ).toBe('ep-x.example.invalid');
  });

  test('falls back to the last @… host on a scheme-less URI', () => {
    expect(extractPgHost('user:p@ss@ep-x.example.invalid/neondb')).toBe(
      'ep-x.example.invalid',
    );
  });

  test('returns null for empty or hostless input', () => {
    expect(extractPgHost('')).toBeNull();
    expect(extractPgHost('   ')).toBeNull();
    expect(extractPgHost('not-a-url')).toBeNull();
  });
});

describe('parseDatabaseUrlFromEnvFile', () => {
  test('reads DATABASE_URL and ignores other keys and comments', () => {
    const contents = [
      '# comment',
      'NEON_PROJECT_ID=abc',
      `DATABASE_URL=${PROD}`,
      'BLOB_READ_WRITE_TOKEN=tok',
    ].join('\n');
    expect(parseDatabaseUrlFromEnvFile(contents)).toBe(PROD);
  });

  test('accepts export and quoted values; last DATABASE_URL wins', () => {
    const contents = [
      'export DATABASE_URL="postgres://first.example/db"',
      "DATABASE_URL='postgres://second.example/db'",
    ].join('\n');
    expect(parseDatabaseUrlFromEnvFile(contents)).toBe('postgres://second.example/db');
  });

  test('returns null when the key is missing or empty', () => {
    expect(parseDatabaseUrlFromEnvFile('NEON_PROJECT_ID=abc\n')).toBeNull();
    expect(parseDatabaseUrlFromEnvFile('DATABASE_URL=\n')).toBeNull();
    expect(parseDatabaseUrlFromEnvFile('')).toBeNull();
  });
});

describe('assertTestDatabaseNotProduction', () => {
  test('does nothing when TEST_DATABASE_URL is unset or blank', () => {
    expect(() =>
      assertTestDatabaseNotProduction({
        inheritedDatabaseUrl: PROD,
        testDatabaseUrl: undefined,
        envLocalDatabaseUrl: PROD,
      }),
    ).not.toThrow();
    expect(() =>
      assertTestDatabaseNotProduction({
        inheritedDatabaseUrl: PROD,
        testDatabaseUrl: '   ',
        envLocalDatabaseUrl: PROD,
      }),
    ).not.toThrow();
  });

  test('allows a TEST_DATABASE_URL whose host differs from both sources', () => {
    expect(() =>
      assertTestDatabaseNotProduction({
        inheritedDatabaseUrl: PROD,
        testDatabaseUrl: BRANCH,
        envLocalDatabaseUrl: PROD,
      }),
    ).not.toThrow();
  });

  test('throws when TEST_DATABASE_URL matches the inherited host', () => {
    expectSafeThrow(
      () =>
        assertTestDatabaseNotProduction({
          inheritedDatabaseUrl: PROD,
          testDatabaseUrl: 'postgres://other:pw@ep-main.example.invalid/other',
          envLocalDatabaseUrl: null,
        }),
      PROD_TEST_DB_MESSAGE,
    );
  });

  test('throws when TEST_DATABASE_URL matches the .env.local host', () => {
    expectSafeThrow(
      () =>
        assertTestDatabaseNotProduction({
          inheritedDatabaseUrl: undefined,
          testDatabaseUrl: BRANCH,
          envLocalDatabaseUrl: 'postgres://u:p@ep-branch.example.invalid/db',
        }),
      PROD_TEST_DB_MESSAGE,
    );
  });

  test('treats neon -pooler and a trailing port as the same host', () => {
    expectSafeThrow(
      () =>
        assertTestDatabaseNotProduction({
          inheritedDatabaseUrl: 'postgres://u:p@ep-main-pooler.example.invalid:5432/db',
          testDatabaseUrl: 'postgres://u:p@ep-main.example.invalid/db',
          envLocalDatabaseUrl: null,
        }),
      PROD_TEST_DB_MESSAGE,
    );
  });

  test('compares hosts case-insensitively', () => {
    expectSafeThrow(
      () =>
        assertTestDatabaseNotProduction({
          inheritedDatabaseUrl: 'postgres://u:p@EP-MAIN.EXAMPLE.INVALID/db',
          testDatabaseUrl: 'postgres://u:p@ep-main.example.invalid/db',
          envLocalDatabaseUrl: null,
        }),
      PROD_TEST_DB_MESSAGE,
    );
  });

  test('fails closed when TEST_DATABASE_URL has no extractable host', () => {
    expectSafeThrow(
      () =>
        assertTestDatabaseNotProduction({
          inheritedDatabaseUrl: PROD,
          testDatabaseUrl: 'not-a-url',
          envLocalDatabaseUrl: null,
        }),
      UNPARSEABLE_TEST_DB_MESSAGE,
    );
  });

  test('fails closed when a production URL is present but unparseable', () => {
    expectSafeThrow(
      () =>
        assertTestDatabaseNotProduction({
          inheritedDatabaseUrl: 'not-a-url',
          testDatabaseUrl: BRANCH,
          envLocalDatabaseUrl: null,
        }),
      UNPARSEABLE_PROD_DB_MESSAGE,
    );
    expectSafeThrow(
      () =>
        assertTestDatabaseNotProduction({
          inheritedDatabaseUrl: undefined,
          testDatabaseUrl: BRANCH,
          envLocalDatabaseUrl: 'not-a-url',
        }),
      UNPARSEABLE_PROD_DB_MESSAGE,
    );
  });

  test('fails closed when .env.local exists but cannot be read', () => {
    expectSafeThrow(
      () =>
        assertTestDatabaseNotProduction({
          inheritedDatabaseUrl: undefined,
          testDatabaseUrl: BRANCH,
          envLocalDatabaseUrl: null,
          envLocalUnreadable: true,
        }),
      UNREADABLE_ENV_LOCAL_MESSAGE,
    );
  });

  test('does not require .env.local when TEST_DATABASE_URL is unset', () => {
    expect(() =>
      assertTestDatabaseNotProduction({
        inheritedDatabaseUrl: undefined,
        testDatabaseUrl: undefined,
        envLocalDatabaseUrl: null,
        envLocalUnreadable: true,
      }),
    ).not.toThrow();
  });
});

describe('vitest setup wiring', () => {
  test('setup always pins DATABASE_URL to the dummy', () => {
    expect(process.env.DATABASE_URL).toBe(DUMMY_DATABASE_URL);
  });
});
