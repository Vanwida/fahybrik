-- 0091: workout_assignments.station_assignment is LEGACY / DERIVED-AT-READ.
--
-- WHAT THIS IS
-- ------------
-- Documents (does NOT drop) workout_assignments.station_assignment as a legacy
-- column with NO WRITER. The Dobles HYROX "reparto" (how the 8 functional
-- stations are split between the two paired athletes) is DERIVED at read from
-- the coach's dobles_simulations (migration 0055 — the single source of truth)
-- by the athlete assignment-detail endpoint (web/lib/athlete/dobles-station-
-- split.ts), resolved to the READING athlete's perspective. It is never persisted
-- back onto this column, so the derived reparto always tracks the coach's current
-- strategy with zero write-path drift.
--
-- WHY KEEP THE COLUMN
-- -------------------
-- Dropping it is a heavier, irreversible change with no benefit today: it holds
-- no data (it was never written) and the row schema still references its shape.
-- Marking it clearly prevents a future writer from being added by mistake.
--
-- Idempotent: `comment on column` is declarative (it overwrites any prior
-- comment), so re-running is a no-op. Additive and non-breaking — no data, type,
-- or constraint change.

begin;

comment on column workout_assignments.station_assignment is
  '0091 LEGACY / NEVER WRITTEN: the Dobles HYROX reparto is DERIVED at read from dobles_simulations (0055, the single source of truth), resolved to the reading athlete''s perspective by web/lib/athlete/dobles-station-split.ts. This column has no writer and stays NULL. Do not add a writer — derive the reparto instead.';

commit;
