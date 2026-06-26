// Per-segment actuals — what the athlete ACTUALLY did, per exercise.
//
// On workout finish the athlete logs one `segment_executions` row per tracked
// segment (a run leg, an erg piece, a strength block), keyed by
// `template_segment_id` + ordinal `position`. The coach session-detail endpoint
// shows the prescription (template blocks) but, until now, only the AGGREGATE of
// the execution (total duration + session RPE). This module turns those segment
// rows into coach-facing `SegmentActual`s mapped to the prescribed item via its
// uid (`segment-{template_segment_id}`), so the session drawer can render
// prescrito → hecho side by side.
//
// Honest by construction: a segment with no `template_segment_id` maps to
// `item_uid = null` (surfaced as an unmatched lap, never invented against a
// prescription); a session with no segment rows yields `[]` (the UI falls back
// to the aggregate, no fabricated per-exercise numbers).
//
// `segment_executions` carries NO per-segment RPE column — perceived exertion is
// session-level only (`workout_executions.perceived_exertion`), so it is not part
// of this shape on purpose.

import type { Sql } from '@/lib/db';
import { SEGMENT_MODALITIES, type SegmentModality } from '@/lib/sync/ingest-execution-segments';

/** One logged segment, mapped to its prescribed item. Numerics are real numbers. */
export interface SegmentActual {
  /** Ordinal of the logged segment within the execution. */
  position: number;
  /** uid of the prescribed item this maps to (`segment-{id}`); null when unmatched. */
  item_uid: string | null;
  modality: SegmentModality;
  /** Derived from ended_at − started_at; null when either timestamp is missing. */
  duration_seconds: number | null;
  reps_completed: number | null;
  weight_used_kg: number | null;
  distance_meters: number | null;
  avg_pace_s_per_500m: number | null;
  avg_pace_s_per_km: number | null;
  avg_power_w: number | null;
  stroke_rate_spm: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
}

// Raw DB row. pg returns `numeric` columns as strings, so the numeric fields are
// typed `string | number | null` and coerced once in `buildSegmentActuals`.
export interface SegmentActualRow {
  template_segment_id: string | null;
  position: number;
  modality: string | null;
  started_at: string | null;
  ended_at: string | null;
  reps_completed: number | null;
  weight_used_kg: string | number | null;
  distance_meters: string | number | null;
  avg_pace_s_per_500m: string | number | null;
  avg_pace_s_per_km: string | number | null;
  avg_power_w: string | number | null;
  stroke_rate_spm: string | number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: string | number | null;
}

const MODALITY_SET = new Set<string>(SEGMENT_MODALITIES);

function toModality(raw: string | null): SegmentModality {
  return raw != null && MODALITY_SET.has(raw) ? (raw as SegmentModality) : 'other';
}

function num(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function durationSeconds(started: string | null, ended: string | null): number | null {
  if (!started || !ended) return null;
  const s = new Date(started).getTime();
  const e = new Date(ended).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  const d = Math.round((e - s) / 1000);
  return d > 0 ? d : null;
}

/** Pure mapper: DB rows → coach-facing actuals (testable without a DB). */
export function buildSegmentActuals(rows: SegmentActualRow[]): SegmentActual[] {
  return rows.map((r) => ({
    position: r.position,
    item_uid: r.template_segment_id != null ? `segment-${r.template_segment_id}` : null,
    modality: toModality(r.modality),
    duration_seconds: durationSeconds(r.started_at, r.ended_at),
    reps_completed: r.reps_completed ?? null,
    weight_used_kg: num(r.weight_used_kg),
    distance_meters: num(r.distance_meters),
    avg_pace_s_per_500m: num(r.avg_pace_s_per_500m),
    avg_pace_s_per_km: num(r.avg_pace_s_per_km),
    avg_power_w: num(r.avg_power_w),
    stroke_rate_spm: num(r.stroke_rate_spm),
    avg_hr: r.avg_hr ?? null,
    max_hr: r.max_hr ?? null,
    calories: num(r.calories),
  }));
}

/** Load the per-segment actuals for ONE workout execution, ordered by position. */
export async function loadSegmentActuals(sql: Sql, executionId: number): Promise<SegmentActual[]> {
  const rows = await sql<SegmentActualRow[]>`
    select
      template_segment_id::text as template_segment_id,
      position                  as position,
      modality                  as modality,
      started_at::text          as started_at,
      ended_at::text            as ended_at,
      reps_completed            as reps_completed,
      weight_used_kg            as weight_used_kg,
      distance_meters           as distance_meters,
      avg_pace_s_per_500m       as avg_pace_s_per_500m,
      avg_pace_s_per_km         as avg_pace_s_per_km,
      avg_power_w               as avg_power_w,
      stroke_rate_spm           as stroke_rate_spm,
      avg_hr                    as avg_hr,
      max_hr                    as max_hr,
      calories                  as calories
    from segment_executions
    where execution_id = ${executionId}
    order by position asc, id asc
  `;
  return buildSegmentActuals(rows);
}
