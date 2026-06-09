// Per-segment ingestion for a finished workout execution.
//
// iOS reports one entry per segment it tracked during the session (a run leg,
// an erg piece, a strength block). We persist each as a `segment_executions`
// row keyed by (execution_id, position) so the coach/athlete analytics can
// break work down by MODALITY (run vs row vs ski/bike vs strength) and by the
// modality-native intensity fields (run pace /km, erg pace /500m, power, SPM).
//
// Idempotent: re-sending the same payload UPSERTs by (execution_id, position),
// so a retried sync never duplicates segments. Mirrors the conflict strategy
// used for the parent workout_executions row.

import { z } from 'zod';
import type { Sql } from '@/lib/db';

// Canonical modality vocabulary — the single source of truth shared with the
// analytics aggregation. iOS is expected to send one of these; anything else is
// normalised to 'other'. Kept narrow on purpose so run-vs-row buckets are stable.
export const SEGMENT_MODALITIES = ['run', 'row', 'ski', 'bike', 'strength', 'other'] as const;
export type SegmentModality = (typeof SEGMENT_MODALITIES)[number];

/** Normalise a free-ish modality string from the client to the canonical set. */
export function normalizeModality(raw: string | null | undefined): SegmentModality {
  if (!raw) return 'other';
  const v = raw.trim().toLowerCase();
  switch (v) {
    case 'run':
    case 'running':
      return 'run';
    case 'row':
    case 'rowing':
    case 'rowerg':
    case 'row-erg':
      return 'row';
    case 'ski':
    case 'skierg':
    case 'ski-erg':
      return 'ski';
    case 'bike':
    case 'bikeerg':
    case 'bike-erg':
    case 'cycling':
    case 'assault-bike':
      return 'bike';
    case 'strength':
    case 'lift':
    case 'weights':
      return 'strength';
    default:
      return 'other';
  }
}

// Exactly the shape iOS sends per segment on workout finish.
export const segmentInputSchema = z.object({
  template_segment_id: z.number().int().positive().optional(),
  position: z.number().int().min(0),
  modality: z.string().min(1).max(40),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  duration_seconds: z.number().int().min(0).optional(),
  distance_meters: z.number().nonnegative().optional(),
  avg_pace_s_per_500m: z.number().nonnegative().optional(),
  avg_pace_s_per_km: z.number().nonnegative().optional(),
  avg_power_w: z.number().nonnegative().optional(),
  stroke_rate_spm: z.number().nonnegative().optional(),
  avg_hr: z.number().int().min(30).max(260).optional(),
  max_hr: z.number().int().min(30).max(260).optional(),
  calories: z.number().nonnegative().optional(),
  reps_completed: z.number().int().min(0).optional(),
  weight_used_kg: z.number().nonnegative().optional(),
  zone_seconds_json: z.unknown().optional(),
  source: z.string().min(1).max(40).optional(),
});

export type SegmentInput = z.infer<typeof segmentInputSchema>;

/**
 * Upsert one segment_executions row per input segment for a given execution.
 * Derives started/ended from explicit timestamps when present, else from the
 * execution window + duration so we always have a usable interval. Stores
 * zone_seconds_json inside raw_lap_data_json under a `zone_seconds` key.
 *
 * @returns number of segments written.
 */
export async function ingestExecutionSegments(args: {
  sql: Sql;
  executionId: number;
  executionStartedAt: string;
  segments: SegmentInput[];
}): Promise<number> {
  const { sql, executionId, executionStartedAt, segments } = args;
  if (segments.length === 0) return 0;

  let written = 0;
  for (const seg of segments) {
    const startedAt = seg.started_at ?? executionStartedAt;
    // If no explicit end, derive from start + duration so analytics that read
    // (ended_at - started_at) still work.
    const endedAt =
      seg.ended_at ??
      (seg.duration_seconds != null
        ? new Date(new Date(startedAt).getTime() + seg.duration_seconds * 1000).toISOString()
        : startedAt);

    const modality = normalizeModality(seg.modality);
    // Pass the object through sql.json so the jsonb column stores an OBJECT
    // (not a double-encoded JSON string scalar). raw_lap_data_json.zone_seconds
    // must read back as an object for analytics.
    const rawLap =
      seg.zone_seconds_json !== undefined
        ? sql.json({ zone_seconds: seg.zone_seconds_json } as Parameters<typeof sql.json>[0])
        : null;

    await sql`
      insert into segment_executions (
        execution_id, template_segment_id, position,
        started_at, ended_at,
        modality, distance_meters,
        avg_pace_s_per_500m, avg_pace_s_per_km, avg_power_w, stroke_rate_spm,
        avg_hr, max_hr, calories, reps_completed, weight_used_kg,
        raw_lap_data_json, source
      ) values (
        ${executionId}::bigint,
        ${seg.template_segment_id ?? null},
        ${seg.position},
        ${startedAt}::timestamptz,
        ${endedAt}::timestamptz,
        ${modality},
        ${seg.distance_meters ?? null},
        ${seg.avg_pace_s_per_500m ?? null},
        ${seg.avg_pace_s_per_km ?? null},
        ${seg.avg_power_w ?? null},
        ${seg.stroke_rate_spm ?? null},
        ${seg.avg_hr ?? null},
        ${seg.max_hr ?? null},
        ${seg.calories ?? null},
        ${seg.reps_completed ?? null},
        ${seg.weight_used_kg ?? null},
        ${rawLap},
        ${seg.source ?? null}
      )
      on conflict (execution_id, position) do update set
        template_segment_id = coalesce(excluded.template_segment_id, segment_executions.template_segment_id),
        started_at          = excluded.started_at,
        ended_at            = excluded.ended_at,
        modality            = excluded.modality,
        distance_meters     = coalesce(excluded.distance_meters, segment_executions.distance_meters),
        avg_pace_s_per_500m = coalesce(excluded.avg_pace_s_per_500m, segment_executions.avg_pace_s_per_500m),
        avg_pace_s_per_km   = coalesce(excluded.avg_pace_s_per_km, segment_executions.avg_pace_s_per_km),
        avg_power_w         = coalesce(excluded.avg_power_w, segment_executions.avg_power_w),
        stroke_rate_spm     = coalesce(excluded.stroke_rate_spm, segment_executions.stroke_rate_spm),
        avg_hr              = coalesce(excluded.avg_hr, segment_executions.avg_hr),
        max_hr              = coalesce(excluded.max_hr, segment_executions.max_hr),
        calories            = coalesce(excluded.calories, segment_executions.calories),
        reps_completed      = coalesce(excluded.reps_completed, segment_executions.reps_completed),
        weight_used_kg      = coalesce(excluded.weight_used_kg, segment_executions.weight_used_kg),
        raw_lap_data_json   = coalesce(excluded.raw_lap_data_json, segment_executions.raw_lap_data_json),
        source              = coalesce(excluded.source, segment_executions.source),
        updated_at          = now()
    `;
    written += 1;
  }
  return written;
}
