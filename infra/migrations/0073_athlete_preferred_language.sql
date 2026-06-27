-- 0073_athlete_preferred_language.sql
--
-- Add athletes.preferred_language — the athlete's preferred content /
-- communication language (e.g. push notifications, coach messages, plan copy).
--
-- Design decisions:
--   • Two values for now: 'es' (default, Pablo's operating language) and 'en'.
--   • Nullable: NULL means "follow the device locale" — the client resolves it.
--     We never force a default at the DB layer to stay honest (a NULL row and an
--     'es' row would have different semantics: one is "unset", the other is
--     "explicitly chosen Spanish").
--   • Set via PATCH /api/athlete/profile; readable via GET /api/auth/me.
--   • Additive + idempotent: the ADD COLUMN is guarded by IF NOT EXISTS, and the
--     CHECK constraint is added inside a DO block that checks pg_constraint first
--     so re-running the migration never raises "constraint already exists".
--
alter table athletes add column if not exists preferred_language text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'athletes_preferred_language_chk'
  ) then
    alter table athletes add constraint athletes_preferred_language_chk
      check (preferred_language is null or preferred_language in ('es', 'en'));
  end if;
end $$;

comment on column athletes.preferred_language is
  'Athlete preferred language (es|en); null = follow device. Set via PATCH /api/athlete/profile.';
