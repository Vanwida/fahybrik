-- teardown_demo_main.sql — remove ALL demo data from PROD main, the inverse of the
-- seed_demo_* scripts. Keyed by MARKER EMAIL (never fixed ids). FK-ordered so no
-- RESTRICT / NO_ACTION constraint blocks (verified against the live schema by a
-- BEGIN…ROLLBACK dry-run — steps 5b/5c exist only to satisfy two RESTRICT edges:
-- program_month_weeks->program_week_templates and *->program_month_templates).
--
-- Removes the two demo coaches, the two demo athletes, the doubles partner, and
-- EVERYTHING hanging off them — including any stray rows on the demo athletes
-- (e.g. races imported into athlete.demo1 by other tooling cascade with the athlete).
--
-- SAFE BY DEFAULT: wrapped in BEGIN…ROLLBACK, so running it as-is only PRINTS the
-- per-step DELETE counts and changes nothing. To execute for real, change the final
-- ROLLBACK to COMMIT.
--
-- RUN (dry-run):  psql "<main DATABASE_URL>" -v ON_ERROR_STOP=1 -f infra/scripts/teardown_demo_main.sql
BEGIN;

\echo '1) demo athletes (cascades assignments/executions/segments, weekly_plans, microcycles, races->partners/predictions, benchmarks, strength_maxes, zone_profiles, month_assignments, doubles_pairs, invitations, instance-templates):'
delete from athletes
where user_id in (
  select id from users
  where email in ('athlete.demo1@demo.fahybrid.local','athlete.demo2@demo.fahybrid.local','athlete.demo.partner@demo.fahybrid.local')
);

\echo '2) demo joint predictions (dobles_simulations — RESTRICTs the coach delete; keyed by demo user pair / coach):'
delete from dobles_simulations
where athlete_a_user_id in (select id from users where email in ('athlete.demo1@demo.fahybrid.local','athlete.demo2@demo.fahybrid.local','athlete.demo.partner@demo.fahybrid.local'))
   or athlete_b_user_id in (select id from users where email in ('athlete.demo1@demo.fahybrid.local','athlete.demo2@demo.fahybrid.local','athlete.demo.partner@demo.fahybrid.local'))
   or created_by_coach_id in (select c.id from coaches c join users u on u.id=c.user_id where u.email in ('coach.demo1@fahybrid.local','coach.demo2@fahybrid.local'));

\echo '3) demo coach templates remaining (run-history library templates without instance_athlete_id — RESTRICT the coach delete; template_segments cascade):'
delete from templates
where coach_id in (select c.id from coaches c join users u on u.id=c.user_id where u.email in ('coach.demo1@fahybrid.local','coach.demo2@fahybrid.local'));

\echo '4) demo coach blocks (cloned --c62/--c63 + support blocks; NO_ACTION on coach delete; block_exercises cascade):'
delete from blocks
where coach_id in (select c.id from coaches c join users u on u.id=c.user_id where u.email in ('coach.demo1@fahybrid.local','coach.demo2@fahybrid.local'));

\echo '5) demo doubles event (catalog event created by the doubles seed):'
delete from events where slug = 'hyrox-madrid-2026-doubles-demo';

\echo '5b) demo coach program_sequences (cascades program_sequence_items + athlete_sequence_progress; clears RESTRICT on month templates). None expected from these seeds:'
delete from program_sequences
where coach_id in (select c.id from coaches c join users u on u.id=c.user_id where u.email in ('coach.demo1@fahybrid.local','coach.demo2@fahybrid.local'));

\echo '5c) demo coach program_month_templates (cascades program_month_weeks; clears the RESTRICT program_month_weeks->program_week_templates so the coach delete can cascade week templates):'
delete from program_month_templates
where coach_id in (select c.id from coaches c join users u on u.id=c.user_id where u.email in ('coach.demo1@fahybrid.local','coach.demo2@fahybrid.local'));

\echo '6) demo coaches (cascades methodology_zones, athlete_levels, program_week_templates, program_sequences, coach_members, coach_methodology, etc.):'
delete from coaches
where user_id in (select id from users where email in ('coach.demo1@fahybrid.local','coach.demo2@fahybrid.local'));

\echo '7) demo users (cascades sessions, notifications, subscriptions, apns_push_tokens, user_roles, coach_members; coaches already gone):'
delete from users
where email in ('coach.demo1@fahybrid.local','coach.demo2@fahybrid.local','athlete.demo1@demo.fahybrid.local','athlete.demo2@demo.fahybrid.local','athlete.demo.partner@demo.fahybrid.local');

\echo '--- residue check (all must be 0) ---'
select 'demo users' t, count(*) n from users where email in ('coach.demo1@fahybrid.local','coach.demo2@fahybrid.local','athlete.demo1@demo.fahybrid.local','athlete.demo2@demo.fahybrid.local','athlete.demo.partner@demo.fahybrid.local')
union all select 'demo coach blocks', count(*) from blocks where slug like '%--c62' or slug like '%--c63'
union all select 'demo event', count(*) from events where slug='hyrox-madrid-2026-doubles-demo';

-- Change ROLLBACK -> COMMIT to execute the teardown for real.
ROLLBACK;
