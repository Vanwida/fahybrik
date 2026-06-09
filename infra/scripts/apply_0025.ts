import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_db.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '..', 'migrations', '0025_rate_limit.sql');

const sql = getSql();

try {
  const ddl = readFileSync(MIGRATION, 'utf8');
  console.log(`Applying ${MIGRATION}…`);
  const stripped = ddl
    .replace(/^begin\s*;\s*$/im, '')
    .replace(/^commit\s*;\s*$/im, '');
  await sql.unsafe(stripped);

  const tblExists = await sql<{ exists: boolean }[]>`
    select to_regclass('public.rate_limit_buckets') is not null as exists
  `;
  console.log('rate_limit_buckets exists:', tblExists[0]?.exists);

  const cols = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rate_limit_buckets'
    order by ordinal_position
  `;
  console.log('columns:', cols.map((c) => c.column_name));

  const idx = await sql<{ indexname: string }[]>`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in ('rate_limit_buckets_pkey', 'rate_limit_buckets_window_idx')
    order by indexname
  `;
  console.log('indexes:', idx.map((i) => i.indexname));

  console.log('OK — 0025 applied.');
} finally {
  await sql.end({ timeout: 5 });
}
