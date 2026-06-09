-- 0044: athlete-PROFILE dimension on program_week_templates.
--
-- WHY
-- ---
-- A microcycle (= 1 week of the ATR macrocycle) is authored by Pablo for a
-- BALANCED athlete, but the same week needs PROFILE VARIANTS: an athlete who is
-- strong-but-low-aerobic (endurance_focus) gets aerobic work pushed [+] and
-- strength held at maintenance [=]; a runner-low-strength athlete
-- (strength_focus) gets the mirror. These are SIBLING library entries for the
-- SAME week_number, tagged by profile — NOT a canned macro plan. The AI later
-- selects the variant matching the athlete's profile.
--
-- WHAT
-- ----
--   * New enum `athlete_profile_type` (balanced | strength_focus | endurance_focus).
--   * `athlete_profile` column — not null, defaults to 'balanced' so every
--     existing row is the balanced variant without a backfill.
--   * `week_number` int (1-12, nullable) — which week of the 12-week block this
--     microcycle is. Nullable because standalone library weeks may not be
--     numbered. Bounded 1..12 by a check constraint (nullable-friendly).
--
-- Idempotent: enum created only if absent; columns `if not exists`; the migrate
-- runner journals by stem.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'athlete_profile_type') then
    create type athlete_profile_type as enum ('balanced', 'strength_focus', 'endurance_focus');
  end if;
end
$$;

alter table program_week_templates
  add column if not exists athlete_profile athlete_profile_type not null default 'balanced';

alter table program_week_templates
  add column if not exists week_number int null;

-- 1..12 when present; null allowed. Added guarded so re-runs don't error.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'program_week_templates_week_number_chk'
  ) then
    alter table program_week_templates
      add constraint program_week_templates_week_number_chk
      check (week_number is null or (week_number >= 1 and week_number <= 12));
  end if;
end
$$;

-- Fast "give me the variants for week N" scans for the AI selector.
create index if not exists program_week_templates_profile_week_idx
  on program_week_templates (athlete_profile, week_number);

commit;
