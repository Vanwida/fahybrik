-- 0045: per-segment modality / pace / power columns on segment_executions.
--
-- WHY
-- ---
-- segment_executions captured generic lap data (distance, HR, reps, weight) but
-- had NO way to express HOW the work was measured against its target by
-- MODALITY. A HYROX athlete's session is a mix of RUN segments (paced in /km),
-- ROW/SKI/BIKE erg segments (paced in /500m, with power + stroke rate) and
-- STRENGTH segments (reps + load). Coach analytics need to separate run-vs-row
-- volume/intensity — impossible without an explicit modality tag and the
-- modality-native intensity fields. iOS now sends these per finished segment.
--
-- WHAT
-- ----
--   * modality            text    — canonical modality of the segment as the
--                                   device classified it (run | row | ski |
--                                   bike | strength | other). PRIMARY signal for
--                                   the run-vs-row breakdown; analytics fall back
--                                   to exercises.category/slug when null.
--   * avg_pace_s_per_500m numeric — erg pace (row/ski/bike), seconds per 500 m.
--   * avg_pace_s_per_km   numeric — running pace, seconds per kilometre.
--   * avg_power_w         numeric — average power in watts (erg).
--   * stroke_rate_spm     numeric — strokes/min (row/ski), cadence proxy.
--   * source              text    — ingestion provenance of THIS segment
--                                   (healthkit | garmin | concept2 | manual |
--                                   demo). Distinct from workout_executions.source
--                                   (the biometric_source enum) so we can flag
--                                   demo-seeded rows without polluting the enum.
--
-- All NULLABLE and additive — zero backfill, existing rows unaffected. Idempotent
-- via `if not exists`; the migrate runner journals by filename stem.

begin;

alter table segment_executions
  add column if not exists modality            text,
  add column if not exists avg_pace_s_per_500m numeric(7,2),
  add column if not exists avg_pace_s_per_km   numeric(7,2),
  add column if not exists avg_power_w         numeric(7,1),
  add column if not exists stroke_rate_spm     numeric(5,1),
  add column if not exists source              text;

-- Fast modality breakdown scans (run-vs-row aggregation groups by modality).
create index if not exists segment_executions_modality_idx
  on segment_executions (modality);

commit;
