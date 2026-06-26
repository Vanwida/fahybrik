-- 0068_drop_atr_macrocycle_engine.sql
--
-- WHY:
--   Remove ATR from the TECHNICAL layer entirely. Periodization is now AGNOSTIC:
--   a microcycle hangs directly off the ATHLETE (athlete_id), and the coach's
--   ORDERED sequence of microciclos IS the plan — there is no macrocycle, no
--   ACC/TRANS/REAL, no `atr_block_type`. The current microciclo (name + "semana N
--   de M") is read from `athlete_month_assignments` → `program_month_templates`.
--
--   `microcycles` used to hang off `atr_blocks.id` (block_id, NOT NULL FK). It now
--   hangs off `athletes.id` (athlete_id) — a week resolves by athlete_id + date
--   overlap. The legacy chain (block_id NOT NULL → atr_blocks → atr_macrocycles,
--   all `on delete cascade`) makes athlete_id derivable for ALL existing rows, so
--   the NOT NULL set is non-destructive.
--
--   Also drops the dead macrocycle-TEMPLATE builder trio (program_block_months,
--   program_macrocycle_blocks, program_macrocycle_templates): empty, zero code
--   references, Zod schema removed in the same pass. They were the last users of
--   the `atr_block_type` enum, so they go before the enum is dropped.
--
-- Fully idempotent: re-runnable on a fresh DB (legacy tables present) AND on an
-- already-migrated DB (legacy tables gone). The backfill is guarded so it never
-- references a dropped relation.

begin;

-- 1. Add athlete_id (agnostic ownership) --------------------------------------
alter table microcycles
  add column if not exists athlete_id bigint references athletes(id) on delete cascade;

-- Backfill from the legacy chain ONLY while it still exists (fresh-DB path).
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'atr_blocks') then
    update microcycles mc
      set athlete_id = mac.athlete_id
      from atr_blocks b
      join atr_macrocycles mac on mac.id = b.macrocycle_id
      where mc.block_id = b.id
        and mc.athlete_id is null;
  end if;
end $$;

-- Safety net: orphans with no resolvable owner (cascade makes this impossible)
-- are removed so NOT NULL can apply. No-op once athlete_id is already populated.
delete from microcycles where athlete_id is null;
alter table microcycles alter column athlete_id set not null;

-- 2. Drop the block_id coupling (constraint + index first, then column) --------
alter table microcycles drop constraint if exists microcycles_week_unique;
drop index if exists microcycles_block_idx;
alter table microcycles drop constraint if exists microcycles_block_id_fkey;
alter table microcycles drop column if exists block_id;

-- 3. Index for per-athlete date-overlap resolution ----------------------------
create index if not exists microcycles_athlete_idx on microcycles (athlete_id, start_date);

-- 4. Drop the runtime ATR engine (child before parent) ------------------------
drop table if exists atr_blocks;
drop table if exists atr_macrocycles;

-- 5. Drop the dead macrocycle-TEMPLATE builder trio (child → parents) ---------
drop table if exists program_block_months;
drop table if exists program_macrocycle_blocks;
drop table if exists program_macrocycle_templates;

-- 6. Drop the now-unreferenced enum -------------------------------------------
drop type if exists atr_block_type;

commit;
