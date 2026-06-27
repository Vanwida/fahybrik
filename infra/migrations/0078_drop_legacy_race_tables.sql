-- FAHYBRIK migration 0078: drop the legacy duplicated race tables.
--
-- Applied AFTER every reader was repointed to the unified `races` spine
-- (verified: tsc clean, grep of these table names in active TS = 0). Dropping
-- before the repoint would have broken the build — this is the second half of
-- the safe order.
--
--   * athlete_target_events — the athlete's A/B/C event pin. Superseded by
--     races.priority='target' (+ optional races.event_id catalog link). The
--     "días a carrera objetivo" metric now derives from `races`; nothing wrote
--     this table on the web/onboarding path, so the metric was dead.
--   * race_plans / race_results / race_debriefs — the never-wired race-plan
--     feature (web routes were orphaned; the iOS submit endpoints never
--     existed). race_results duplicated races.result_time_seconds.
--
-- Drop in FK order (debriefs → results → plans; targets last). `cascade` clears
-- each table's own triggers/indexes. The shared set_updated_at() function is NOT
-- dropped (other tables use it). The feature-only enums go too.

begin;

drop table if exists race_debriefs cascade;
drop table if exists race_results cascade;
drop table if exists race_plans cascade;
drop table if exists athlete_target_events cascade;

-- Enums used only by the dropped tables.
drop type if exists race_pace_realism;
drop type if exists race_plan_status;
drop type if exists target_priority;

commit;
