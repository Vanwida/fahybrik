-- 0026: unique partial index on users(partner_id) — A2 DB-level guard.
--
-- redeemInvitation now takes a row lock (SELECT ... FOR UPDATE) on the
-- invitation, but a partial unique index is the belt-and-suspenders defence:
-- it makes a double-link physically impossible even under an unforeseen race
-- or a manual DB edit. partner_id is bidirectional + at-most-one per user, so
-- no two users may point at the same partner.
--
-- NOTE: CREATE INDEX CONCURRENTLY CANNOT run inside a transaction block, so
-- this file intentionally has NO begin/commit. The apply script
-- (infra/scripts/apply_0026.ts) executes it outside a transaction.
--
-- Idempotent: IF NOT EXISTS.

create unique index concurrently if not exists users_partner_id_unique
  on users (partner_id)
  where partner_id is not null;
