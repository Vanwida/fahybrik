// migrate.ts — idempotent migration runner (A6 finding).
//
// Until now migrations were applied by hand via one-off apply_00XX.ts scripts
// with NO tracking of what ran. This runner is the single source of truth:
//
//   1. Reads every `*.sql` in infra/migrations/ in lexicographic filename order.
//   2. Reads the `schema_migrations` journal (the version = the full filename
//      stem, e.g. `0005_athlete_intake`).
//   3. Applies only the migrations NOT already in the journal, then records each.
//   4. Re-running is a no-op (idempotent). Each migration is itself written with
//      `if not exists` / `on conflict` guards as a second safety net.
//
// VERSION KEY = full filename stem (NOT the numeric prefix). This is deliberate:
// the directory has historical numbering collisions —
//   * 0005_athlete_intake  + 0005_coach_weekly_reviews
//   * 0012_events_visibility_and_division + 0012_stripe_billing
//   * 0025_rate_limit + 0025_migration_journal (renamed → 0028)
//   * 0026_partner_id_unique + 0026_llm_invocations (renamed → 0029)
//   * 0027_plan_published_notification + 0027_methodology_groups (renamed → 0030)
// Keying on the stem makes each unique regardless of prefix collisions. There is
// also a GAP at 0022 — that number was skipped during development and NO 0022
// file ever existed (it was never deleted, it simply never happened). The runner
// doesn't care about gaps or collisions; it processes whatever files are present.
//
// Usage:
//   tsx scripts/migrate.ts            # apply pending migrations
//   tsx scripts/migrate.ts --backfill # mark the existing historical set as
//                                      # already-applied WITHOUT running them
//                                      # (use once, on a DB that already has the
//                                      #  schema from the manual apply_* era).
//   tsx scripts/migrate.ts --dry-run  # show the plan, change nothing
//
// The journal table itself (0025_migration_journal.sql) is bootstrapped before
// the journal is queried, so a fresh DB works too.

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_db.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, '..', 'migrations');
const JOURNAL_BOOTSTRAP = '0028_migration_journal';

type Migration = { version: string; file: string; sql: string; checksum: string };

function loadMigrations(): Migration[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  return files.map((file) => {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    return {
      version: file.replace(/\.sql$/, ''),
      file,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    };
  });
}

/**
 * postgres.js can run multi-statement SQL via `unsafe`, but explicit
 * `begin;`/`commit;` inside the file collide with how we want to wrap each
 * migration. We strip the file's own transaction control and wrap the whole
 * migration in ONE transaction so a mid-file failure rolls back cleanly.
 */
function stripTxn(sql: string): string {
  return sql
    .replace(/^\s*begin\s*;\s*$/gim, '')
    .replace(/^\s*commit\s*;\s*$/gim, '');
}

async function ensureJournal(sql: ReturnType<typeof getSql>): Promise<void> {
  // Bootstrap the journal table itself from its migration file so a fresh DB
  // can be migrated from zero. Idempotent (the file uses `if not exists`).
  const bootstrap = loadMigrations().find((m) => m.version === JOURNAL_BOOTSTRAP);
  if (!bootstrap) {
    // Fallback: minimal inline DDL if the file was renamed/removed.
    await sql.unsafe(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now(),
        checksum text null
      );
    `);
    return;
  }
  await sql.unsafe(stripTxn(bootstrap.sql));
}

async function appliedVersions(sql: ReturnType<typeof getSql>): Promise<Set<string>> {
  const rows = await sql<{ version: string }[]>`select version from schema_migrations`;
  return new Set(rows.map((r) => r.version));
}

async function main(): Promise<void> {
  const mode: 'apply' | 'backfill' | 'dry-run' = process.argv.includes('--backfill')
    ? 'backfill'
    : process.argv.includes('--dry-run')
      ? 'dry-run'
      : 'apply';

  const sql = getSql();
  try {
    const migrations = loadMigrations();
    await ensureJournal(sql);
    const already = await appliedVersions(sql);

    const pending = migrations.filter((m) => !already.has(m.version));

    if (pending.length === 0) {
      console.log(`[migrate] up to date — ${already.size} migration(s) recorded, 0 pending.`);
      return;
    }

    console.log(`[migrate] mode=${mode} — ${pending.length} pending migration(s):`);
    for (const m of pending) console.log(`  · ${m.version}`);

    if (mode === 'dry-run') {
      console.log('[migrate] dry-run — nothing applied.');
      return;
    }

    if (mode === 'backfill') {
      // Record the existing set as applied WITHOUT running the DDL — the schema
      // is already present from the manual apply_* era. Use `on conflict do
      // nothing` so re-running is safe.
      //
      // `--through=<version>` caps the backfill at a given migration (inclusive),
      // by lexicographic stem order. Use it to backfill ONLY the historical set
      // (already in the DB) and leave genuinely-new migrations for `apply`. E.g.:
      //   tsx scripts/migrate.ts --backfill --through=0027_plan_published_notification
      // records 0001..0027 as applied, then a plain `apply` runs 0028+.
      const throughArg = process.argv.find((a) => a.startsWith('--through='));
      const through = throughArg ? throughArg.slice('--through='.length) : null;

      const toRecord = through
        ? pending.filter((m) => m.version.localeCompare(through, 'en') <= 0)
        : pending;

      for (const m of toRecord) {
        await sql`
          insert into schema_migrations (version, checksum)
          values (${m.version}, ${m.checksum})
          on conflict (version) do nothing
        `;
        console.log(`  ✓ backfilled (recorded, not run): ${m.version}`);
      }
      console.log(
        `[migrate] backfill complete — ${toRecord.length} recorded${through ? ` (through ${through})` : ''}.`,
      );
      return;
    }

    // mode === 'apply': run each pending migration in its own transaction, then
    // record it. The journal bootstrap (0028) may be in `pending` on a fresh DB;
    // ensureJournal already created the table, so re-running its DDL is a no-op.
    for (const m of pending) {
      console.log(`[migrate] applying ${m.version}…`);
      const body = stripTxn(m.sql);
      // `CREATE INDEX CONCURRENTLY` (and a few other statements) cannot run
      // inside a transaction block. Such migrations are authored WITHOUT
      // begin/commit; we run them via unsafe() outside a txn, then record the
      // journal row separately. Everything else gets the safe single-txn wrap.
      const isConcurrent = /\bconcurrently\b/i.test(body);
      if (isConcurrent) {
        await sql.unsafe(body);
        await sql`
          insert into schema_migrations (version, checksum)
          values (${m.version}, ${m.checksum})
          on conflict (version) do update set
            applied_at = now(),
            checksum = excluded.checksum
        `;
      } else {
        await sql.begin(async (tx) => {
          await tx.unsafe(body);
          await tx`
            insert into schema_migrations (version, checksum)
            values (${m.version}, ${m.checksum})
            on conflict (version) do update set
              applied_at = now(),
              checksum = excluded.checksum
          `;
        });
      }
      console.log(`  ✓ applied ${m.version}`);
    }

    console.log(`[migrate] done — ${pending.length} migration(s) applied.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
