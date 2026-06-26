-- 0071: hyresult.com full-history import — additive.
--
-- WHY
-- ---
-- 0054 added the single-URL official-site importer (results.hyrox.com → one
-- `races` row per pasted link). hyresult.com lets us import an athlete's ENTIRE
-- HYROX history (every singles AND doubles/relay race) by name in one shot. Two
-- gaps in the current schema block that:
--
--   1. hyresult exposes ELITE brackets (HYROX ELITE / DOUBLES ELITE / PRO
--      DOUBLES ELITE / ELITE RELAY) the `race_division` enum ('open','pro')
--      can't represent. We add 'elite'.
--   2. A new provenance value 'hyresult_import' so the source CHECK accepts it.
--   3. Doubles/relay races have TEAMMATES — a 1-to-many fact. Per the repo's
--      no-JSON-blob rule, teammates get their own explicit-column table
--      (`race_partners`), keyed (race_id, position).
--
-- All additive: a new enum value, a widened CHECK, a new table + index. Nothing
-- touches existing rows or the official importer (0054), which keeps working.
--
-- IDEMPOTENT
-- ----------
--   * ADD VALUE IF NOT EXISTS — safe inside the migrate runner's per-migration
--     transaction on PG12+ (the new value is NOT used in this migration, so the
--     "can't use a new enum value in the same txn" restriction does not apply).
--   * source CHECK: drop-if-exists then add → always lands on the widened
--     predicate, re-runnable.
--   * table + index: `if not exists`.

begin;

-- 1. division enum: ELITE bracket. Additive, never used in this migration.
alter type race_division add value if not exists 'elite';

-- 2. source provenance: accept 'hyresult_import' alongside 'manual','hyrox_import'.
--    `source` is a TEXT column guarded by a CHECK (not an enum — see 0054), so we
--    widen the CHECK rather than ALTER an enum.
alter table races drop constraint if exists races_source_chk;
alter table races
  add constraint races_source_chk
  check (source in ('manual', 'hyrox_import', 'hyresult_import'));

-- 3. race_partners — doubles/relay teammates (1-to-many; explicit columns).
--    `position` is the teammate's order in the source team[] AFTER the athlete
--    themselves is removed (a partner is never yourself). `source_idp` is the
--    SHARED team idp — every teammate of one race carries the same value, so it
--    also links co-imported athletes. ON DELETE CASCADE: partners die with the
--    race; re-import replaces them (delete-then-insert) so it stays idempotent.
create table if not exists race_partners (
  race_id    bigint not null references races (id) on delete cascade,
  position   int    not null,
  name       text   not null,
  slug       text,
  nation     text,
  source_idp text,
  primary key (race_id, position)
);

-- Per-race teammate lookup (render "con: …" for a doubles/relay race).
create index if not exists race_partners_race_idx on race_partners (race_id);

commit;
