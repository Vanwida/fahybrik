-- 0091_athlete_timezone.sql
--
-- Add athletes.timezone — the athlete's IANA timezone (e.g. 'Europe/Madrid'),
-- reported by their device on every HealthKit sync (TimeZone.current.identifier).
--
-- Why: readiness ("¿Cómo llegas hoy?") windows biometric signals by CALENDAR DAY
-- in the athlete's own timezone, the way Whoop/Garmin do — last night's sleep and
-- the early-morning resting-HR sample land after 22:00 UTC (= 00:00 local), so a
-- UTC `recorded_at::date = today` filter silently drops them. To bucket "last
-- night" / "today" correctly we need the athlete's zone.
--
-- Design decisions:
--   • IANA string, nullable. NULL means "device hasn't reported yet" — the compute
--     layer falls back to Europe/Madrid (Fabrik's box timezone, single-coach launch
--     reality). We never force a DB default so a NULL row ("unset") and an
--     'Europe/Madrid' row ("device actually reported Madrid") stay distinguishable.
--   • No DB CHECK: Postgres can't validate an IANA identifier. The write path
--     (POST /api/sync/healthkit) validates it with Intl.DateTimeFormat server-side.
--   • Additive + idempotent: ADD COLUMN guarded by IF NOT EXISTS so re-running is safe.
--
alter table athletes add column if not exists timezone text;

comment on column athletes.timezone is
  'Athlete IANA timezone (e.g. Europe/Madrid); null = device not yet reported, compute falls back to box tz. Set via POST /api/sync/healthkit (TimeZone.current.identifier).';
