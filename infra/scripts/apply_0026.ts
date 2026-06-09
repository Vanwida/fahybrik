import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_db.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '..', 'migrations', '0026_partner_id_unique.sql');

const sql = getSql();

try {
  const ddl = readFileSync(MIGRATION, 'utf8');
  console.log(`Applying ${MIGRATION}…`);

  // CREATE INDEX CONCURRENTLY cannot run inside a transaction block. postgres-js
  // sends `unsafe()` statements outside an implicit transaction, so we run the
  // single CONCURRENTLY statement directly. We strip comment-only lines so the
  // remaining text is one statement.
  const statement = ddl
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim()
    .replace(/;\s*$/, '');

  // Guard: a pre-existing duplicate partner_id pair would make the CONCURRENTLY
  // build fail (INVALID index). Surface it clearly instead of leaving an
  // invalid index behind.
  const dupes = await sql<{ partner_id: string; n: number }[]>`
    select partner_id::text as partner_id, count(*)::int as n
    from users
    where partner_id is not null
    group by partner_id
    having count(*) > 1
  `;
  if (dupes.length > 0) {
    console.error('ABORT — duplicate partner_id rows present, cannot build unique index:', dupes);
    throw new Error('partner_id duplicates must be resolved before applying 0026');
  }

  await sql.unsafe(statement);

  const idx = await sql<{ indexname: string; indisvalid: boolean }[]>`
    select i.relname as indexname, ix.indisvalid as indisvalid
    from pg_class i
    join pg_index ix on ix.indexrelid = i.oid
    where i.relname = 'users_partner_id_unique'
  `;
  console.log('index:', idx.map((i) => `${i.indexname} (valid=${i.indisvalid})`));

  console.log('OK — 0026 applied.');
} finally {
  await sql.end({ timeout: 5 });
}
