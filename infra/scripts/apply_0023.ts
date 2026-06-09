import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_db.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '..', 'migrations', '0023_partner_invitations.sql');

const sql = getSql();

try {
  const ddl = readFileSync(MIGRATION, 'utf8');
  console.log(`Applying ${MIGRATION}…`);
  const stripped = ddl
    .replace(/^begin\s*;\s*$/im, '')
    .replace(/^commit\s*;\s*$/im, '');
  await sql.unsafe(stripped);

  const tblExists = await sql<{ exists: boolean }[]>`
    select to_regclass('public.partner_invitations') is not null as exists
  `;
  console.log('partner_invitations exists:', tblExists[0]?.exists);

  const cols = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'partner_invitations'
    order by ordinal_position
  `;
  console.log('columns:', cols.map((c) => c.column_name));

  const idx = await sql<{ indexname: string }[]>`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'partner_invitations_token_idx',
        'partner_invitations_inviter_idx',
        'partner_invitations_invitee_email_idx'
      )
    order by indexname
  `;
  console.log('indexes present:', idx.map((i) => i.indexname));

  const constraints = await sql<{ conname: string }[]>`
    select conname
    from pg_constraint
    where conrelid = 'public.partner_invitations'::regclass
      and conname = 'partner_invitations_status_chk'
  `;
  console.log('status check constraint:', constraints.map((c) => c.conname));

  console.log('0023 OK');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
