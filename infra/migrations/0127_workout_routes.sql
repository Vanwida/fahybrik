-- 0127: workout_routes — the GPS trace of an outdoor run, one per execution (#64).
--
-- (Numbering note: the runner journals by filename stem, so gaps/collisions are
-- harmless. 0126 is the current highest on this branch → this is 0127.)
--
-- WHY
-- ---
-- An outdoor run captured live on the phone (CoreLocation) produces an ordered path
-- of coordinates. We store it so the athlete can see the MAP of the run they just
-- did (and, later, the coach). It is a single artifact PER execution — a run has one
-- route — so it lives in its own 1:1 table keyed to workout_executions rather than
-- bloating the execution row with a large text blob every session carries whether or
-- not it was outdoors.
--
-- WHAT
-- ----
--   * execution_id — FK workout_executions(id), ON DELETE CASCADE (the route is
--                    meaningless without its execution) and UNIQUE (exactly one route
--                    per execution; a re-sync upserts, never duplicates).
--   * polyline     — the trace as a Google ENCODED POLYLINE (precision 5), NOT a JSON
--                    array of coordinates: ~5× smaller and the de-facto standard
--                    MapKit/Leaflet/etc. decode. NOT NULL — a row exists only when
--                    there IS a trace.
--   * point_count  — number of coordinate pairs (server-derived from the polyline).
--                    Cheap metadata for "N puntos" / sanity, nullable for older rows.
--   * created_at   — server receipt time.
--
-- Idempotent via `if not exists`; single-concern, revertible.

begin;

create table if not exists workout_routes (
  id           bigserial primary key,
  execution_id bigint not null unique references workout_executions(id) on delete cascade,
  polyline     text not null check (char_length(polyline) between 1 and 200000),
  point_count  integer,
  created_at   timestamptz not null default now()
);

commit;
