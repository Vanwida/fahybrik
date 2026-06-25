-- 0066: zone profile PROVENANCE + REVIEW gate.
--
-- WHY
-- ---
-- The athlete already enters benchmark times in onboarding (a 5K run, a 2K row
-- split…). Migration 0061 stores resolved zones in athlete_zone_profiles, but
-- nothing converted those benchmarks into zones — the coach had to re-register a
-- test by hand. We now AUTO-derive zone profiles from onboarding benchmarks
-- (reusing the same resolver). An auto profile is real but UNCONFIRMED: it must
-- be surfaced to the coach as "revisar" and either confirmed or overridden by a
-- manual test. These two columns carry that state.
--
--   source        — 'onboarding_auto' (derived from benchmarks, pending review)
--                   | 'coach_test' (recorded from a coach test, validated).
--   needs_review  — true while an auto profile awaits the coach's confirm.
--
-- ADDITIVE + idempotent: nullable-defaulted columns, guarded constraint. Existing
-- rows were all coach-recorded and already validated, so the defaults
-- ('coach_test', false) are the correct backfill — no data touched.

begin;

alter table athlete_zone_profiles
  add column if not exists source       text    not null default 'coach_test',
  add column if not exists needs_review boolean not null default false;

-- Closed provenance set (guarded so re-running is a no-op).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'athlete_zone_profiles_source_chk'
  ) then
    alter table athlete_zone_profiles
      add constraint athlete_zone_profiles_source_chk
      check (source in ('coach_test', 'onboarding_auto'));
  end if;
end $$;

comment on column athlete_zone_profiles.source is
  '0066: provenance — onboarding_auto (derived from benchmarks, pending coach review) | coach_test (recorded test, validated). A coach test always wins.';
comment on column athlete_zone_profiles.needs_review is
  '0066: true while an onboarding-auto profile awaits the coach''s confirm. The doses still resolve from it (better the athlete''s real zones than none); the coach UI surfaces it as "revisar".';

commit;
