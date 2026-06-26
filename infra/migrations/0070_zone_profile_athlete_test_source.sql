-- 0070_zone_profile_athlete_test_source.sql
--
-- Athlete self-entered tests. Until now only the coach (coach_test) or the
-- onboarding auto-derive (onboarding_auto) produced a zone profile. The athlete
-- can now record their own test (run/row/ski) from the app, through the SAME
-- resolve+store path (POST /api/athlete/test-result → resolveZonesForAthlete +
-- insertZoneProfileVersion). It writes a new versioned profile tagged
-- 'athlete_test'; the latest version per modality is current, so "Mis zonas"
-- reflects it immediately. The coach retains authority — recording a coach_test
-- adds a newer version that wins.
--
-- ADDITIVE: widen the closed provenance set on athlete_zone_profiles.source to
-- include 'athlete_test'. Idempotent (drop-if-exists then re-add).

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'athlete_zone_profiles_source_chk'
  ) then
    alter table athlete_zone_profiles drop constraint athlete_zone_profiles_source_chk;
  end if;
  alter table athlete_zone_profiles
    add constraint athlete_zone_profiles_source_chk
    check (source in ('coach_test', 'onboarding_auto', 'athlete_test'));
end $$;

comment on column athlete_zone_profiles.source is
  '0070: provenance — onboarding_auto (derived from benchmarks, pending coach review) | coach_test (coach-recorded test, validated) | athlete_test (athlete self-entered from the app). Latest version per modality wins; a coach test overrides by adding a newer version.';
