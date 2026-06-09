import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

function loadEnvLocal(): void {
  const envPath = resolve(REPO_ROOT, '.env.local');
  let raw: string;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set (expected in .env.local)');
  }
  // Production (Neon) requires SSL. Honor an explicit `sslmode=disable` in the
  // URL so a LOCAL or EPHEMERAL throwaway DB (no SSL) can be targeted for
  // migration/seed verification without weakening the prod default.
  const ssl: 'require' | false = /[?&]sslmode=disable\b/.test(url) ? false : 'require';
  return postgres(url, {
    ssl,
    prepare: false,
    max: 4,
    idle_timeout: 5,
  });
}
