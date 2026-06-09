import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_db.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '..', 'migrations', '0021_dobles_weekly_plans.sql');

const sql = getSql();

try {
  const ddl = readFileSync(MIGRATION, 'utf8');
  console.log(`Applying ${MIGRATION}…`);
  // Strip ONLY the top-level transaction wrappers so the statement runs through
  // `postgres` (which rejects multi-statement transactions outside sql.begin).
  // We must NOT strip `begin`/`end` that live inside DO blocks, so we only
  // remove a `begin;` on its own line at the very start and a `commit;` on its
  // own line at the very end. DDL is idempotent via `IF NOT EXISTS` / DO-blocks,
  // so autocommit-per-statement is safe.
  const stripped = ddl
    .replace(/^begin\s*;\s*$/im, '')
    .replace(/^commit\s*;\s*$/im, '');
  await sql.unsafe(stripped);

  // 1. users columns
  const userCols = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name in ('partner_id', 'box_member', 'idioma', 'box_class_schedule')
    order by column_name
  `;
  console.log('users new cols:', userCols.map((c) => c.column_name));

  // 2. weekly_plans table + row count
  const wpExists = await sql<{ exists: boolean }[]>`
    select to_regclass('public.weekly_plans') is not null as exists
  `;
  console.log('weekly_plans exists:', wpExists[0]?.exists);
  if (wpExists[0]?.exists) {
    const wpCount = await sql<{ count: string }[]>`select count(*)::text as count from weekly_plans`;
    console.log('weekly_plans rows:', wpCount[0]?.count);
  }

  // 3. workout_assignments new cols
  const waCols = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workout_assignments'
      and column_name in ('station_assignment', 'partner_visibility')
    order by column_name
  `;
  console.log('workout_assignments new cols:', waCols.map((c) => c.column_name));

  // 4. subscriptions table
  const subsExists = await sql<{ exists: boolean }[]>`
    select to_regclass('public.subscriptions') is not null as exists
  `;
  console.log('subscriptions exists:', subsExists[0]?.exists);

  // Enums
  const enums = await sql<{ typname: string }[]>`
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typtype = 'e'
      and n.nspname = 'public'
      and t.typname in ('weekly_plan_status', 'subscription_status')
    order by t.typname
  `;
  console.log('enums present:', enums.map((e) => e.typname));

  // Indexes
  const idx = await sql<{ indexname: string }[]>`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'users_partner_id_idx',
        'weekly_plans_status_idx',
        'weekly_plans_athlete_week_idx',
        'subscriptions_user_idx',
        'subscriptions_partner_idx',
        'subscriptions_status_idx'
      )
    order by indexname
  `;
  console.log('indexes present:', idx.map((i) => i.indexname));

  console.log('0021 OK');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
