/**
 * Fail-closed host guard for Vitest. Compares TEST_DATABASE_URL against
 * inherited DATABASE_URL and the root .env.local value. Never logs URLs.
 *
 * Hosts identify a Neon branch; user/password may differ. -pooler and a
 * trailing :port are stripped so the same endpoint cannot sneak through.
 */

export const DUMMY_DATABASE_URL =
  'postgres://test-user:test-pass@127.0.0.1:5432/test-db';

export const PROD_TEST_DB_MESSAGE =
  'TEST_DATABASE_URL points at the same host as production. Point TEST_DATABASE_URL at a disposable Neon branch.';

export const UNPARSEABLE_TEST_DB_MESSAGE =
  'TEST_DATABASE_URL is set but its host could not be determined. Refusing to run. Point TEST_DATABASE_URL at a disposable Neon branch.';

export const UNPARSEABLE_PROD_DB_MESSAGE =
  'A production DATABASE_URL is present but its host could not be determined. Refusing to run.';

export const UNREADABLE_ENV_LOCAL_MESSAGE =
  'Cannot read .env.local to verify TEST_DATABASE_URL is not production.';

export type ProdDbGuardInput = {
  inheritedDatabaseUrl: string | undefined;
  testDatabaseUrl: string | undefined;
  envLocalDatabaseUrl: string | null;
  envLocalUnreadable?: boolean;
};

export function extractPgHost(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const host = new URL(trimmed).host;
    if (host) return host;
  } catch {
    // rare / unencoded URI — fall through
  }
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return null;
  const rest = trimmed.slice(at + 1);
  const host = rest.split(/[/?]/, 1)[0];
  return host || null;
}

function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/-pooler(?=\.|$)/, '');
}

function present(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function parseDatabaseUrlFromEnvFile(contents: string): string | null {
  let found: string | null = null;
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const cleaned = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eq = cleaned.indexOf('=');
    if (eq < 0) continue;
    const key = cleaned.slice(0, eq).trim();
    if (key !== 'DATABASE_URL') continue;
    let value = cleaned.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    found = value.length > 0 ? value : null;
  }
  return found;
}

export function assertTestDatabaseNotProduction(input: ProdDbGuardInput): void {
  const testUrl = present(input.testDatabaseUrl);
  if (!testUrl) return;

  if (input.envLocalUnreadable) {
    throw new Error(UNREADABLE_ENV_LOCAL_MESSAGE);
  }

  const testHost = extractPgHost(testUrl);
  if (!testHost) {
    throw new Error(UNPARSEABLE_TEST_DB_MESSAGE);
  }

  const candidates: Array<string | null> = [
    present(input.inheritedDatabaseUrl),
    input.envLocalDatabaseUrl,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const host = extractPgHost(candidate);
    if (!host) {
      throw new Error(UNPARSEABLE_PROD_DB_MESSAGE);
    }
    if (normalizeHost(host) === normalizeHost(testHost)) {
      throw new Error(PROD_TEST_DB_MESSAGE);
    }
  }
}
