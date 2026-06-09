-- 0032: hash partner_invitations.token at rest (Finding M12).
--
-- Until now the invitation token was stored in CLEARTEXT (0023:19). A DB leak
-- would hand an attacker live, redeemable tokens — exactly the threat the
-- magic_link_tokens table already defends against by storing only a SHA-256
-- hash (lib/auth/magic-link.ts:hashToken). This migration brings invitations
-- to the same standard:
--
--   1. Add `token_sha256` (the hex SHA-256 of the plaintext token), UNIQUE.
--   2. Backfill the hash for any existing rows from their plaintext `token`
--      (this is test/demo data — no production tokens are in flight — so an
--      in-place backfill is safe and keeps pending invitations redeemable).
--   3. Drop the NOT NULL + UNIQUE constraints from the legacy `token` column
--      and NULL it out so the cleartext secret no longer lives at rest. The
--      column is retained (nullable) purely so older code paths don't break;
--      it is marked DEPRECATED and the application no longer reads or writes it.
--
-- New invitation creation/redemption (lib/partner/invitations.ts) writes and
-- looks up by `token_sha256`; the plaintext token is only ever returned to the
-- caller at creation time (for the email/deeplink) and never persisted.
--
-- Idempotent: IF NOT EXISTS / guarded DROPs / conditional backfill throughout.

begin;

-- 1) Hash column + unique index.
alter table partner_invitations
  add column if not exists token_sha256 text;

-- 2) Backfill hashes for existing cleartext tokens. encode(digest(...)) mirrors
-- the app's createHash('sha256').digest('hex'). pgcrypto provides digest().
create extension if not exists pgcrypto;

update partner_invitations
set token_sha256 = encode(digest(token, 'sha256'), 'hex')
where token_sha256 is null
  and token is not null;

create unique index if not exists partner_invitations_token_sha256_uidx
  on partner_invitations (token_sha256);

-- 3) Retire the cleartext column: drop its unique/not-null constraints so we can
-- null it out, then wipe the plaintext secret. The column stays (nullable) to
-- avoid breaking anything that still references it, but holds no secret.
do $$
begin
  -- Drop the legacy UNIQUE on token (constraint name from the implicit
  -- `unique` in 0023; resolve dynamically so we don't depend on the name).
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'partner_invitations'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%(token)%'
  ) then
    execute (
      select 'alter table partner_invitations drop constraint ' || quote_ident(c.conname)
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname = 'partner_invitations'
        and c.contype = 'u'
        and pg_get_constraintdef(c.oid) ilike '%(token)%'
      limit 1
    );
  end if;
end $$;

alter table partner_invitations alter column token drop not null;

comment on column partner_invitations.token is
  'DEPRECATED (0032): cleartext token retired in favour of token_sha256. No longer read/written by the app. Nulled out for existing rows.';

-- Wipe the cleartext secret now that the hash backfill above captured it.
update partner_invitations set token = null where token is not null;

commit;
