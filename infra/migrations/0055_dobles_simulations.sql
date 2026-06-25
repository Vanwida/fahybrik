-- 0055: Dobles SIMULATION storage — the coach-authored joint race strategy for
-- a paired HYROX Doubles team.
--
-- WHY
-- ---
-- A HYROX Doubles team is two paired athletes (users.partner_id, migration
-- 0021) racing as one. The COACH authors a SIMULATION: how the 8 functional
-- stations are split between the two athletes, the running plan (both partners
-- always run every 1km together per HYROX Doubles rules), the RoxZone relay
-- handoffs, and a one-line tactical note. The iOS app already declares the read
-- contract (ios/.../Dobles/DoblesService.swift → DoblesSimulation /
-- DoblesStationSplit) but no backend stored it. This table is that home.
--
-- COACH-NEUTRAL STORAGE, PER-ATHLETE READ
-- ---------------------------------------
-- Storage is A/B-neutral (athlete_a_user_id, athlete_b_user_id): each station
-- carries `assigned_to` ('a' | 'b' | 'split') and, when split, `self_share`
-- = the share ATHLETE A carries (0..1; B = 1 - self_share). The athlete-facing
-- API resolves this to the READER's point of view (iOS `self_share`): when the
-- reader is A, self_share is stored as-is; when the reader is B, the API emits
-- 1 - stored_share. The coach editor is A-centric (the athlete in the route).
--
-- STATION INDEX = canonical HYROX element index
-- ---------------------------------------------
-- station_splits[].station_index uses the SAME canonical 16-element station
-- index as race plans/actuals (shared STATION_INDEX_STATION = 2,4,6,8,10,12,
-- 14,16 → SkiErg, Sled push, Sled pull, Burpee broad jump, Row, Farmer carry,
-- Sandbag lunge, Wall ball; see shared/schema/race-plan.ts HYROX_STATION_LABELS).
-- Storing the canonical index means a simulation reconciles with the same
-- athlete's race plan and imported result with zero remapping.
--
-- WHAT (jsonb shape of station_splits — validated server-side by Zod, never the
-- DB; the column is a check-guarded jsonb array):
--   [ { station_index: int (one of 2,4,6,8,10,12,14,16),
--       assigned_to: 'a' | 'b' | 'split',
--       self_share: number 0..1 (A's share; relevant when assigned_to='split'),
--       note?: string } , ... ]  -- exactly the 8 stations, in canonical order.
--
-- UNIQUENESS: one simulation per (A, B, target_event). target_event_id is
-- nullable (a generic, no-event-bound simulation). NULLs don't collide in a
-- plain unique index, so a partial-style coalesce expression index is used to
-- treat "no event" as a single slot per pair.
--
-- Idempotent: table/index `if not exists`; check constraints guarded by
-- DO-block existence probes. Journaled by filename stem (0055_dobles_simulations).

begin;

create table if not exists dobles_simulations (
  id                  bigint generated always as identity primary key,
  athlete_a_user_id   bigint not null references users(id) on delete cascade,
  athlete_b_user_id   bigint not null references users(id) on delete cascade,
  target_event_id     bigint null references events(id) on delete set null,
  -- The 8-station split strategy (canonical HYROX station indices). Validated
  -- by Zod at the API boundary; the DB only guards that it is a jsonb array.
  station_splits      jsonb not null default '[]'::jsonb,
  -- Running plan note: in HYROX Doubles BOTH partners run every 1km together,
  -- so this is the coach's free-form running tactic (pacing leader, etc.).
  running_note        text null,
  -- RoxZone relay handoff note (who tags in/out, transition tactics).
  roxzone_note        text null,
  -- One-line tactical summary surfaced as the simulation intro on iOS.
  tactical_note       text null,
  created_by_coach_id bigint not null references coaches(id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint dobles_simulations_distinct_athletes_chk
    check (athlete_a_user_id <> athlete_b_user_id)
);

-- station_splits must be a jsonb ARRAY (the per-station objects are validated by
-- Zod at the API boundary; this is the DB-level shape floor).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dobles_simulations_station_splits_array_chk'
      and conrelid = 'public.dobles_simulations'::regclass
  ) then
    alter table dobles_simulations
      add constraint dobles_simulations_station_splits_array_chk
      check (jsonb_typeof(station_splits) = 'array');
  end if;
end $$;

-- One simulation per pair per event. A null event = a single "generic" slot per
-- pair (coalesce to 0, an id `events` never uses since it is identity-generated
-- starting at 1), so re-saving upserts in place instead of duplicating.
create unique index if not exists dobles_simulations_pair_event_unique
  on dobles_simulations (athlete_a_user_id, athlete_b_user_id, coalesce(target_event_id, 0));

create index if not exists dobles_simulations_athlete_a_idx
  on dobles_simulations (athlete_a_user_id);

create index if not exists dobles_simulations_athlete_b_idx
  on dobles_simulations (athlete_b_user_id);

commit;
