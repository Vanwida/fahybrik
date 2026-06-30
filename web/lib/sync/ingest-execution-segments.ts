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
import type { Sql, TransactionClient } from '@/lib/db';
import { REPS_STATUSES, RX_SCALED_VALUES, type RepsStatus } from '@fahybrid/shared/schema';

// Re-export the honest-logging vocabulary (single source lives in shared) so the
// sync layer's public surface stays self-contained for callers/tests.
export { REPS_STATUSES, RX_SCALED_VALUES, type RepsStatus };

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

/**
 * Derive the honest reps status when the client omits it (locked contract rule):
 *   actual == null                          → 'skipped'
 *   prescribed != null && actual != presc.  → 'scaled'
 *   else                                    → 'done'
 * A wire-supplied status always wins; this only fills the gap.
 */
export function deriveRepsStatus(
  actual: number | null | undefined,
  prescribed: number | null | undefined,
): RepsStatus {
  if (actual == null) return 'skipped';
  if (prescribed != null && actual !== prescribed) return 'scaled';
  return 'done';
}

// One working set of a strength segment. All optional except `set_index`; a NULL
// `reps_actual` means the set was skipped (never a fabricated 0).
export const setInputSchema = z.object({
  set_index: z.number().int().min(1),
  reps_prescribed: z.number().int().min(0).nullable().optional(),
  reps_actual: z.number().int().min(0).nullable().optional(),
  load_prescribed_kg: z.number().nonnegative().nullable().optional(),
  load_actual_kg: z.number().nonnegative().nullable().optional(),
  rpe: z.number().min(0).max(10).nullable().optional(),
  rir: z.number().min(0).max(10).nullable().optional(),
  status: z.enum(REPS_STATUSES).optional(),
  confirmed: z.boolean().optional(),
  tempo: z.string().max(20).optional(),
  rest_s: z.number().int().min(0).optional(),
});

export type SetInput = z.infer<typeof setInputSchema>;

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
  // Legacy alias kept for back-compat: = ACTUAL reps (or null when skipped).
  // Ingest prefers `reps_actual` when present; never coalesces a skip to 0.
  reps_completed: z.number().int().min(0).optional(),
  weight_used_kg: z.number().nonnegative().optional(),
  // Honest-logging fields (all optional; see deriveRepsStatus for the fallback).
  reps_prescribed: z.number().int().min(0).nullable().optional(),
  // Canonical actual; NULL only when skipped.
  reps_actual: z.number().int().min(0).nullable().optional(),
  reps_status: z.enum(REPS_STATUSES).optional(),
  reps_confirmed: z.boolean().optional(),
  is_structural: z.boolean().optional(),
  rx_scaled: z.enum(RX_SCALED_VALUES).optional(),
  scaled_note: z.string().max(500).optional(),
  // Per-set strength detail; delete-then-insert by segment on re-sync.
  sets: z.array(setInputSchema).max(60).optional(),
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
  sql: Sql | TransactionClient;
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

    // Honest reps state. `reps_actual` is canonical; `reps_completed` is the
    // legacy alias for the SAME value. NULL means skipped — NEVER fabricate a 0.
    const repsActual =
      seg.reps_actual !== undefined ? seg.reps_actual : (seg.reps_completed ?? null);
    const repsPrescribed = seg.reps_prescribed ?? null;
    // Only rep-bearing segments carry a status — a pure run/erg leg (no reps at
    // all) must NOT be stamped 'skipped'. Derive only when the client omits it
    // AND the segment actually involves reps.
    const hasRepSignal =
      seg.reps_actual !== undefined ||
      seg.reps_completed !== undefined ||
      repsPrescribed != null ||
      seg.reps_status !== undefined;
    const repsStatus =
      seg.reps_status ?? (hasRepSignal ? deriveRepsStatus(repsActual, repsPrescribed) : null);
    const repsConfirmed = seg.reps_confirmed ?? false;
    const isStructural = seg.is_structural ?? false;

    const rows = await sql<Array<{ id: string }>>`
      insert into segment_executions (
        execution_id, template_segment_id, position,
        started_at, ended_at,
        modality, distance_meters,
        avg_pace_s_per_500m, avg_pace_s_per_km, avg_power_w, stroke_rate_spm,
        avg_hr, max_hr, calories, reps_completed, weight_used_kg,
        reps_prescribed, reps_status, reps_confirmed, is_structural, rx_scaled, scaled_note,
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
        ${repsActual},
        ${seg.weight_used_kg ?? null},
        ${repsPrescribed},
        ${repsStatus},
        ${repsConfirmed},
        ${isStructural},
        ${seg.rx_scaled ?? null},
        ${seg.scaled_note ?? null},
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
        weight_used_kg      = coalesce(excluded.weight_used_kg, segment_executions.weight_used_kg),
        -- Honest-logging fields are a COHERENT group: the latest payload is the
        -- athlete's declared truth, so we OVERWRITE (a skip's NULL stays NULL —
        -- never coalesced to an old value or a fabricated 0).
        reps_completed      = excluded.reps_completed,
        reps_prescribed     = excluded.reps_prescribed,
        reps_status         = excluded.reps_status,
        reps_confirmed      = excluded.reps_confirmed,
        is_structural       = excluded.is_structural,
        rx_scaled           = excluded.rx_scaled,
        scaled_note         = excluded.scaled_note,
        raw_lap_data_json   = coalesce(excluded.raw_lap_data_json, segment_executions.raw_lap_data_json),
        source              = coalesce(excluded.source, segment_executions.source),
        updated_at          = now()
      returning id::text
    `;
    written += 1;

    // Per-set strength detail. Delete-then-insert keyed on the parent segment so
    // a retried sync replaces cleanly (no orphan/dupe sets). Only touched when
    // the client sends a `sets` array for this segment.
    if (seg.sets && seg.sets.length > 0) {
      const segmentExecutionId = Number(rows[0]?.id);
      if (Number.isFinite(segmentExecutionId)) {
        await sql`delete from set_executions where segment_execution_id = ${segmentExecutionId}`;
        for (const s of seg.sets) {
          const setActual = s.reps_actual ?? null;
          const setPrescribed = s.reps_prescribed ?? null;
          const setStatus = s.status ?? deriveRepsStatus(setActual, setPrescribed);
          await sql`
            insert into set_executions (
              segment_execution_id, set_index,
              reps_prescribed, reps_actual,
              load_prescribed_kg, load_actual_kg,
              rpe, rir, status, confirmed, tempo, rest_s
            ) values (
              ${segmentExecutionId}::bigint,
              ${s.set_index},
              ${setPrescribed},
              ${setActual},
              ${s.load_prescribed_kg ?? null},
              ${s.load_actual_kg ?? null},
              ${s.rpe ?? null},
              ${s.rir ?? null},
              ${setStatus},
              ${s.confirmed ?? false},
              ${s.tempo ?? null},
              ${s.rest_s ?? null}
            )
          `;
        }
      }
    }
  }
  return written;
}
