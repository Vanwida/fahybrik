-- 0051: attention-engine performance indexes (SPEC §9 FIX 4).
--
-- WHY NO TRANSACTION
-- ------------------
-- Every index here uses `CREATE INDEX CONCURRENTLY`, which Postgres FORBIDS
-- inside a transaction block. The migrate runner (infra/scripts/migrate.ts)
-- detects the word `concurrently` and runs such a migration OUTSIDE a txn via
-- `sql.unsafe()`, recording the journal row separately. So this file MUST NOT
-- contain `begin;` / `commit;` and MUST be self-contained — each statement
-- stands alone. CONCURRENTLY is chosen so building these indexes on a live DB
-- does NOT take an ACCESS EXCLUSIVE lock (no write-blocking on hot tables).
--
-- CAVEAT (CONCURRENTLY + partial re-run): if a CONCURRENTLY build is interrupted
-- it can leave an INVALID index behind. `IF NOT EXISTS` makes the statement a
-- no-op when a (valid OR invalid) index of that name already exists, so a re-run
-- won't error — but an invalid leftover must be dropped by hand before re-running.
-- This is an inherent CONCURRENTLY trade-off, accepted to avoid locking.
--
-- WHAT — the hot queries these serve (verified against web/lib/coach/cohort.ts
-- and web/lib/dashboard/coach/inbox.ts):
--
--  [CREATE] 1. workout_assignments (athlete_id, scheduled_for, status)
--     The existing `workout_assignments_athlete_date_idx` is only
--     (athlete_id, scheduled_for). EVERY hot assignment query also filters on
--     `status` — next_session (status='scheduled'), today_sessions / missed_7d
--     (status='missed'), compliance (status='completed'), the inbox inactivity
--     laterals. Adding `status` as a third key column lets the planner satisfy
--     athlete+date-range+status from the index alone. NON-duplicate superset.
--
--  [SKIP]  2. daily_checkins (athlete_id, recorded_for desc)
--     Already exists verbatim as `daily_checkins_athlete_day_idx`
--     (0010_daily_checkins.sql). The inbox lateral orders by recorded_for desc
--     per athlete → fully served. cohort.ts uses max(recorded_at); a
--     (athlete_id, recorded_at desc) index would be a near-duplicate of marginal
--     value for a once-per-athlete aggregate already covered acceptably by the
--     existing index. SKIPPED to avoid index bloat (correctness over count).
--
--  [SKIP]  3. biometric_streams (athlete_id, metric_type, recorded_at desc)
--     Already exists verbatim as `biometric_streams_athlete_metric_time_idx`
--     (0001_init.sql). This is the exact index the cohort HRV/RHR/sleep/VO2/
--     last-sync CTEs need. Exact DUPLICATE → SKIPPED.
--
--  [CREATE] 4. races — partial index for the inbox "next target race" lateral.
--     0046 already has `races_athlete_date_idx (athlete_id, race_date)` (the
--     general per-athlete-next-race index) — NOT duplicated. The inbox lateral
--     filters athlete_id + race_date>=today + status in ('planned','registered')
--     + priority='target'. A PARTIAL index matching those predicates is a
--     tighter, non-overlapping index for that specific hot path. CREATE.
--
--  [SKIP]  5. week_adjustment_proposals — pending-by-athlete lookup.
--     The hot query (listPendingWeekAdjustments) filters athlete_id +
--     status='pending'. 0017 already has `week_adjustment_proposals_pending_uniq`
--     — a PARTIAL UNIQUE index on (athlete_id, week_start) WHERE status='pending'.
--     That partial index already covers "this athlete's pending proposals"
--     (the only pending rows it indexes), so a separate (athlete_id, status)
--     index would be redundant. SKIPPED.
--
--  [SKIP]  6. chat_threads — listThreadsForCoach join.
--     That loader filters t.coach_id = ? ORDER BY last_message_at desc — exactly
--     served by the existing `chat_threads_coach_idx`
--     (coach_id, last_message_at desc nulls last). A (coach_id, athlete_id) index
--     would also duplicate the existing UNIQUE constraint
--     `chat_threads_coach_athlete_unique (coach_id, athlete_id)`. SKIPPED.
--
--  [CREATE] 7. chat_messages (thread_id, read_at) WHERE read_at is null
--     The cohort unread-message CTE filters cm.read_at is null (and
--     deleted_at is null) per thread. The existing `chat_messages_thread_idx`
--     is (thread_id, created_at desc) — does NOT help the read_at-is-null scan.
--     A PARTIAL index over only unread rows is small and exactly targets the
--     unanswered-message detection. CREATE.
--
-- NET: 3 new indexes created, 4 SKIPPED as duplicates of existing indexes.

-- 1. workout_assignments: athlete + date range + status (superset of the
--    existing athlete_id,scheduled_for index).
create index concurrently if not exists workout_assignments_athlete_date_status_idx
  on workout_assignments (athlete_id, scheduled_for, status);

-- 4. races: the inbox "next target race" lateral, as a partial index.
create index concurrently if not exists races_target_upcoming_idx
  on races (athlete_id, race_date)
  where status in ('planned', 'registered') and priority = 'target';

-- 7. chat_messages: unanswered (unread, not deleted) messages per thread.
create index concurrently if not exists chat_messages_unread_idx
  on chat_messages (thread_id, read_at)
  where read_at is null;
