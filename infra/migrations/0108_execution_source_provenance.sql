-- 0108: per-group data provenance on a workout execution (#36 Garmin sin SDK).
--
-- WHY
-- ---
-- One real workout can be assembled from SEVERAL sources: an Apple-Health device
-- skeleton (times, distance, HR, calories — stamped 'healthkit'), a screenshot→
-- IA capture that ENRICHES it with what the skeleton lacks (splits, power, per-
-- 500m pace, time-in-zone), a manual log, and the athlete's own edits. Until now
-- a `workout_executions` row carried ONE provenance value — `source` — for the
-- whole row. After a fusion that is a lie: the totals came from the watch, the
-- splits from the capture, the RPE from the athlete. The coach (and the deferred
-- reconciler in Fase 2) need to know WHICH source owns each group of fields.
--
-- THE MODEL (Fork B — provenance by GROUP, no dead weight)
-- -------------------------------------------------------
-- A result splits into four groups: totals · segments · score · rpe.
--   totals_source  : provider that owns the measured totals block.
--   score_source   : provider that owns the final metcon/HYROX score.
--   contributing_sources : the SET of providers that supplied ≥1 value — the
--                    fused-state signal (length ≥ 2 ⇒ a genuine fusion).
-- Two groups get NO new column ON PURPOSE:
--   - rpe  : perceived exertion is ALWAYS the athlete — an invariant, not data.
--   - segments : already provenance-tagged per row on segment_executions.source.
-- The legacy `source` stays as the whole-row provenance and, for the single-
-- source rows that exist today, equals `totals_source` (see the backfill).
--
-- WHAT
-- ----
-- workout_executions gains totals_source, score_source (nullable
-- `biometric_source`) and contributing_sources (`biometric_source[]`, NOT NULL,
-- default '{}'). Existing rows are backfilled from their current single `source`
-- so no row is left provenance-blank. ADDITIVE + idempotent (`add column if not
-- exists`); the backfill only fills the just-added columns and touches nothing
-- else. The migrate runner journals by filename stem (0108_execution_source_
-- provenance).

begin;

alter table workout_executions
  add column if not exists totals_source biometric_source,
  add column if not exists score_source  biometric_source,
  add column if not exists contributing_sources biometric_source[] not null default '{}'::biometric_source[];

-- Backfill from the legacy single-source provenance. A pre-fusion row was
-- entirely one source, so that source owns its totals; it owns the score only if
-- a score was recorded; and it is the sole contributor. Idempotent: re-running
-- only rewrites the same values (guarded to rows not yet backfilled).
update workout_executions
set
  totals_source = source,
  score_source = case
    when score_time_s is not null or score_rounds is not null or score_reps is not null then source
    else null
  end,
  contributing_sources = case
    when source is not null then array[source]::biometric_source[]
    else '{}'::biometric_source[]
  end
where source is not null
  and totals_source is null
  and contributing_sources = '{}'::biometric_source[];

commit;
