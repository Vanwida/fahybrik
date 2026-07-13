-- 0129_athlete_max_hr.sql
--
-- Add athletes.max_hr_bpm — the athlete's MEASURED maximum heart rate (bpm), the
-- anchor the app uses to derive HR training zones.
--
-- (Numbering note: 0119 lives on another in-flight branch and the runner journals
-- by filename stem, so gaps/collisions are harmless. 0128 is the current highest
-- on this branch → this is 0129.)
--
-- Design decisions:
--   • Nullable: NULL means "never measured" — the client falls back to an
--     age-estimated max. We never write an estimate into this column so a real
--     measured value and an absence stay honestly distinguishable (mirrors the
--     preferred_language NULL-vs-'es' reasoning in 0073).
--   • Distinct from every existing HR field: leads.fc_maxima is a self-reported
--     funnel hint (deliberately NOT carried to the athlete) and
--     segment_executions.max_hr is a per-segment execution peak — neither is the
--     athlete's standing physiological max. This column is that home.
--   • Set via PATCH /api/athlete/profile; readable via GET /api/auth/me; shown
--     read-only in the coach ficha (PerfilTab).
--   • Range [100, 230] matches the API Zod guard (the API validates, this CHECK is
--     the DB backstop). Additive + idempotent: ADD COLUMN is IF NOT EXISTS and the
--     CHECK is added inside a DO block guarded on pg_constraint.
--
alter table athletes add column if not exists max_hr_bpm int;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'athletes_max_hr_bpm_chk'
  ) then
    alter table athletes add constraint athletes_max_hr_bpm_chk
      check (max_hr_bpm is null or max_hr_bpm between 100 and 230);
  end if;
end $$;

comment on column athletes.max_hr_bpm is
  'Measured max HR (bpm), anchor for HR zones; null = never measured → app estimates from age. Set via PATCH /api/athlete/profile.';
