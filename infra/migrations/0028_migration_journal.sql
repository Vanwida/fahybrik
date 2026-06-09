-- 0028: schema_migrations journal — tracking table for applied migrations.
--
-- Until now migrations were applied by hand (apply_00XX.ts one-offs) with NO
-- record of what ran where. That's the A6 finding. This table is the source of
-- truth for "which migrations are applied on this database", consumed by
-- infra/scripts/migrate.ts.
--
-- Numbering note (A6): the migrations/ directory has historical numbering
-- collisions — TWO 0005 files (athlete_intake + coach_weekly_reviews) and TWO
-- 0012 files (events_visibility_and_division + stripe_billing). There is also a
-- GAP at 0022 (no such file ever existed — it was skipped during development,
-- not deleted). We do NOT renumber the files (that would rewrite history and
-- break the apply_00XX one-offs). Instead the journal keys on the FULL filename
-- stem (e.g. `0005_athlete_intake`, `0005_coach_weekly_reviews`) so collisions
-- resolve to unique versions. See migrate.ts for the backfill of the historical
-- set.

begin;

create table if not exists schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now(),
  checksum    text null
);

commit;
