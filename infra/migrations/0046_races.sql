-- 0046: races — the RACE/COMPETITION domain.
--
-- WHY
-- ---
-- The race is the ANCHOR of the periodization: the ATR macrocycle peaks at it,
-- and the athlete's "Hoy" screen shows a "days until race" countdown. Until now
-- the only competition concept was the shared `events` catalog (HYROX venues
-- Pablo curates) + `athlete_target_events` (an athlete flagging an event A/B/C).
-- That models "which public event am I aiming at", NOT "MY race entry": its
-- format/division/gender category, my goal time, my result, my registration
-- status. A race is per-athlete, owns its own competition attributes, and is the
-- single thing the countdown + peaking logic point at. So it is its own table —
-- ADDITIVE, it does not touch events / target-events / plan / analytics.
--
-- WHAT
-- ----
--   * Enums: race_event_type, race_format, race_division, race_gender,
--     race_status, race_priority.
--   * Table `races` — one row per athlete race entry.
--
-- PRIORITY (A/B/C-race periodization)
-- -----------------------------------
-- A race is not standalone — it has a role in the plan:
--   * 'target'    = the GOAL race the plan peaks/tapers to. Anchors the
--                   periodization and the main countdown. An athlete has ONE
--                   current target (not enforced in the schema — a coach may
--                   stage a future target — but `getTargetRace` returns the
--                   soonest upcoming one).
--   * 'secondary' = raced with a mini-taper but not the focus.
--   * 'tune_up'   = intermediate race used as training/test, no taper (e.g. a
--                   10k mid-marathon-block, or a Sept comp before a Nov target).
-- `getNextRace` returns the soonest upcoming race of ANY priority (could be a
-- tune_up before the target); `getTargetRace` returns the soonest 'target'.
--   * Index (athlete_id, race_date) — powers "the athlete's next race" lookup
--     (earliest race_date >= today for an athlete) and the per-athlete list.
--
-- Idempotent: enums created only if absent; table + index `if not exists`; the
-- migrate runner journals by filename stem.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'race_event_type') then
    create type race_event_type as enum ('hyrox', 'deka', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'race_format') then
    create type race_format as enum ('singles', 'doubles', 'relay');
  end if;
  if not exists (select 1 from pg_type where typname = 'race_division') then
    create type race_division as enum ('open', 'pro');
  end if;
  if not exists (select 1 from pg_type where typname = 'race_gender') then
    create type race_gender as enum ('men', 'women', 'mixed');
  end if;
  if not exists (select 1 from pg_type where typname = 'race_status') then
    create type race_status as enum ('planned', 'registered', 'completed');
  end if;
  if not exists (select 1 from pg_type where typname = 'race_priority') then
    create type race_priority as enum ('target', 'secondary', 'tune_up');
  end if;
end
$$;

create table if not exists races (
  id                   bigserial primary key,
  athlete_id           bigint not null references athletes (id) on delete cascade,
  created_by_coach_id  bigint references coaches (id) on delete set null,
  name                 text not null,
  event_type           race_event_type not null,
  format               race_format not null,
  division             race_division not null,
  gender_category      race_gender not null,
  priority             race_priority not null default 'target',
  age_group            text,
  race_date            date not null,
  location             text,
  goal_time_seconds    int,
  result_time_seconds  int,
  status               race_status not null default 'registered',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- "Next race for athlete" (earliest race_date >= today) + per-athlete list scans.
create index if not exists races_athlete_date_idx
  on races (athlete_id, race_date);

commit;
