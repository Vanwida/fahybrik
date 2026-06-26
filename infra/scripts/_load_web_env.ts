/**
 * _load_web_env.ts — side-effect module that loads web/.env.local into
 * process.env BEFORE any `@/lib/*` module is evaluated.
 *
 * Import this FIRST (before any web service import) in scripts that reuse the
 * real web services (which read DATABASE_URL / AUTH_SECRET at module load). ESM
 * evaluates the import graph depth-first in source order, so importing this
 * module before the `@/lib/...` imports guarantees the env is populated before
 * `@/lib/db` / `@/lib/auth/config` initialise.
 *
 * Never overwrites a var already set in the real environment (CI / explicit
 * `DATABASE_URL=... tsx ...` wins), mirroring infra/scripts/_db.ts.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// infra/scripts → repo web/.env.local
const ENV_PATH = resolve(HERE, '..', '..', 'web', '.env.local');

try {
  const raw = readFileSync(ENV_PATH, 'utf8');
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
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  // No .env.local (e.g. CI with vars already in env) — fine, vars must be set
  // some other way; the services will throw a clear "Missing env" if not.
}
