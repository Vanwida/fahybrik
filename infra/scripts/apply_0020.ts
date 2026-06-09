import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_db.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '..', 'migrations', '0020_template_segments_blocks.sql');

const sql = getSql();

try {
  const ddl = readFileSync(MIGRATION, 'utf8');
  console.log(`Applying ${MIGRATION}…`);
  // Strip explicit BEGIN/COMMIT so the statement runs through `postgres`
  // (which rejects multi-statement transactions outside sql.begin). DDL is
  // idempotent via `IF NOT EXISTS`, so autocommit-per-statement is safe.
  const stripped = ddl
    .replace(/^\s*begin\s*;?\s*$/gim, '')
    .replace(/^\s*commit\s*;?\s*$/gim, '');
  await sql.unsafe(stripped);

  // Verify columns exist (idempotency check).
  const cols = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'template_segments'
      and column_name in ('block_position', 'block_format', 'block_title')
    order by column_name
  `;
  console.log('columns present:', cols.map((c) => c.column_name));

  const idx = await sql<{ indexname: string }[]>`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'template_segments'
      and indexname = 'template_segments_block_idx'
  `;
  console.log('index present:', idx.map((i) => i.indexname));

  console.log('0020 OK');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
