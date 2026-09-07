// Record a finished workout execution — the SINGLE source of truth shared by
// the solo sync route (POST /api/sync/workout-execution), the joint Dobles
// route (POST /api/athlete/dobles/session/[id]/log), and the free-workout
// save. One writer. The prescribed path used to commit the execution row
// and then ingest tramos outside a transaction: a later throw left the
// assignment `scheduled`, and the historial INNER JOIN on completed|partial
// hid the row. Free already wrapped in `db.begin`. Same writer, one durability.

import { z } from 'zod';
import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  ingestExecutionSegments,
  segmentDurationSeconds,
  segmentInputSchema,
} from '@/lib/sync/ingest-execution-segments';
import { deriveExecutionProvenance } from '@fahybrid/shared/domain/execution-merge';
import { polylinePointCount } from '@/lib/sync/polyline';
import { setAssignmentStatus } from '@/lib/sync/assignment-status';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';
import { computeSessionTotals } from '@/lib/execution/session-totals';
import { detectExecutionRunningPRs } from '@/lib/sync/running-prs';
import type { RunningPR } from '@fahybrid/shared/domain/running/best-efforts';
import { coerceWireInstant } from '@/lib/sync/wire-instant';
import {
  sanitizeCompleteness,
  sanitizeDeclaredSource,
  sanitizeDurationSeconds,
  sanitizeNotes,
  sanitizeNonNegativeInt,
  sanitizePainArea,
  sanitizePerceivedDifficulty,
  sanitizePerceivedExertion,
  sanitizeRecordedVia,
  sanitizeRoutePolyline,
  sanitizeSegmentSource,
  sanitizeSourceWorkoutRef,
  clipText,
  PAIN_NOTE_MAX,
} from '@/lib/sync/sanitize-measurement';

const wireInstantOrOmitted = z
  .string()
  .nullish()
  .transform((v) => coerceWireInstant(v) ?? undefined);

// Identity is strict. Evidence is not: a device/athlete field that does not
// fit is accepted here and gated at persist. Zod rejecting one field used to
// 400 the whole POST — a different field each day, same lost session.
export const executionMetricsSchema = z.object({
  perceived_exertion: z.number().nullish(),
  total_duration_seconds: z.number().nullish(),
  notes: z.string().nullish(),
  score_time_s: z.number().nullish(),
  score_rounds: z.number().nullish(),
  score_reps: z.number().nullish(),
  // HINT only. Unknown tokens (`pm5`) are ignored; provenance reads the tramos.
  source: z.string().nullish(),
  recorded_via: z.string().nullish(),
  source_workout_ref: z.string().nullish(),
  completeness: z.string().nullish(),
  perceived_difficulty: z.string().nullish(),
  pain_area: z.string().nullish(),
  pain_note: z.string().nullish(),
  started_at: wireInstantOrOmitted,
  ended_at: wireInstantOrOmitted,
  route_polyline: z.string().nullish(),
  segments: z.array(segmentInputSchema).nullish(),
});

export const workoutExecutionSchema = executionMetricsSchema.extend({
  assignment_id: z.union([z.string(), z.number()]),
});

export type ExecutionMetricsInput = z.infer<typeof executionMetricsSchema>;

export type RecordExecutionResult =
  | { ok: false; reason: 'invalid_assignment' | 'not_found' }
  | {
      ok: true;
      assignment_id: string;
      execution_id: string;
      segments_saved: number;
      prs: RunningPR[];
    };

/** Pool clients expose `end`. A `begin` callback's tx does not. */
export function isPoolWriteClient(client: Sql | TransactionClient): client is Sql {
  return typeof (client as Sql).end === 'function';
}

/**
 * Upsert the workout_executions row for an athlete's assignment, ingest any
 * per-segment actuals, and mark the assignment 'completed' (full protocol) or
 * 'partial' (terminated early), per `input.completeness`. Ownership-scoped: the
 * assignment MUST belong to the athlete (else `not_found`). Idempotent — a
 * retried sync merges by assignment_id / (execution_id, position).
 *
 * When handed the pool, the write (execution + tramos + assignment status)
 * runs in ONE transaction so historial cannot see a half-save. When handed a
 * tx (free workout), that tx is reused — no second writer, no nested begin.
 */
export async function recordWorkoutExecution(args: {
  athleteId: number;
  assignmentId: number;
  input: ExecutionMetricsInput;
  sql?: Sql | TransactionClient;
}): Promise<RecordExecutionResult> {
  const client = args.sql ?? defaultSql;
  const result = isPoolWriteClient(client)
    ? await client.begin((tx) => persistWorkoutExecution({ ...args, sql: tx }))
    : await persistWorkoutExecution({ ...args, sql: client });

  if (result.ok) {
    void recomputeAthlete({ athlete_id: args.athleteId }).catch(() => {});
  }
  return result;
}

async function persistWorkoutExecution(args: {
  athleteId: number;
  assignmentId: number;
  input: ExecutionMetricsInput;
  sql: Sql | TransactionClient;
}): Promise<RecordExecutionResult> {
  const { athleteId, assignmentId, input, sql } = args;

  if (!Number.isFinite(assignmentId)) return { ok: false, reason: 'invalid_assignment' };

  const owned = await sql<Array<{ id: string; session_format: string | null }>>`
    select wa.id::text, t.format::text as session_format
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.id = ${assignmentId} and wa.athlete_id = ${athleteId}
    limit 1
  `;
  if (!owned[0]) return { ok: false, reason: 'not_found' };
  const sessionFormat = owned[0].session_format;

  const startedAt = coerceWireInstant(input.started_at) ?? new Date().toISOString();
  const endedAt = coerceWireInstant(input.ended_at) ?? new Date().toISOString();

  const provenance = deriveExecutionProvenance({
    segments: (input.segments ?? []).map((seg) => ({
      source: sanitizeSegmentSource(seg.source),
      duration_seconds: segmentDurationSeconds(seg),
    })),
    declared_source: sanitizeDeclaredSource(input.source) ?? null,
    declared_recorded_via: sanitizeRecordedVia(input.recorded_via) ?? null,
  });

  const execRows = await sql<Array<{ id: string }>>`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at,
      total_duration_seconds, perceived_exertion, notes,
      score_time_s, score_rounds, score_reps, source, source_workout_ref,
      perceived_difficulty, pain_area, pain_note,
      recorded_via, totals_source, contributing_sources
    )
    values (
      ${assignmentId},
      ${athleteId},
      ${startedAt}::timestamptz,
      ${endedAt}::timestamptz,
      ${sanitizeDurationSeconds(input.total_duration_seconds)},
      ${sanitizePerceivedExertion(input.perceived_exertion)},
      ${sanitizeNotes(input.notes)},
      ${sanitizeNonNegativeInt(input.score_time_s)},
      ${sanitizeNonNegativeInt(input.score_rounds)},
      ${sanitizeNonNegativeInt(input.score_reps)},
      ${provenance.source}::biometric_source,
      ${sanitizeSourceWorkoutRef(input.source_workout_ref)},
      ${sanitizePerceivedDifficulty(input.perceived_difficulty)},
      ${sanitizePainArea(input.pain_area)},
      ${clipText(input.pain_note, PAIN_NOTE_MAX)},
      ${provenance.recorded_via}::execution_recording_method,
      ${provenance.totals_source}::biometric_source,
      ${provenance.contributing_sources}::text[]::biometric_source[]
    )
    on conflict (assignment_id) do update set
      perceived_exertion = coalesce(excluded.perceived_exertion, workout_executions.perceived_exertion),
      total_duration_seconds = coalesce(excluded.total_duration_seconds, workout_executions.total_duration_seconds),
      notes = coalesce(excluded.notes, workout_executions.notes),
      score_time_s = coalesce(excluded.score_time_s, workout_executions.score_time_s),
      score_rounds = coalesce(excluded.score_rounds, workout_executions.score_rounds),
      score_reps = coalesce(excluded.score_reps, workout_executions.score_reps),
      ended_at = coalesce(excluded.ended_at, workout_executions.ended_at),
      source_workout_ref = coalesce(excluded.source_workout_ref, workout_executions.source_workout_ref),
      perceived_difficulty = coalesce(excluded.perceived_difficulty, workout_executions.perceived_difficulty),
      pain_area = coalesce(excluded.pain_area, workout_executions.pain_area),
      pain_note = coalesce(excluded.pain_note, workout_executions.pain_note),
      recorded_via = coalesce(excluded.recorded_via, workout_executions.recorded_via),
      totals_source = coalesce(excluded.totals_source, workout_executions.totals_source),
      contributing_sources = (
        select coalesce(array_agg(distinct s order by s), '{}'::biometric_source[])
        from unnest(workout_executions.contributing_sources || excluded.contributing_sources) as s
      ),
      updated_at = now()
    returning id::text
  `;
  const executionId = Number(execRows[0]?.id);

  const routePolyline = sanitizeRoutePolyline(input.route_polyline);
  if (Number.isFinite(executionId) && routePolyline) {
    await sql`
      insert into workout_routes (execution_id, polyline, point_count)
      values (${executionId}, ${routePolyline}, ${polylinePointCount(routePolyline)})
      on conflict (execution_id) do update set
        polyline = excluded.polyline,
        point_count = excluded.point_count
    `;
  }

  let segmentsSaved = 0;
  if (Number.isFinite(executionId) && input.segments && input.segments.length > 0) {
    segmentsSaved = await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: startedAt,
      segments: input.segments,
      sessionFormat,
    });
  }

  if (Number.isFinite(executionId)) {
    await computeSessionTotals({ execution_id: executionId, client: sql }).catch(() => {});
  }

  const completeness = sanitizeCompleteness(input.completeness);
  const assignmentStatus = completeness === 'partial' ? 'partial' : 'completed';
  await setAssignmentStatus(sql, assignmentId, athleteId, assignmentStatus);

  let prs: RunningPR[] = [];
  if (Number.isFinite(executionId)) {
    prs = await detectExecutionRunningPRs({ sql, athleteId, executionId }).catch(() => []);
  }

  return {
    ok: true,
    assignment_id: String(assignmentId),
    execution_id: String(executionId),
    segments_saved: segmentsSaved,
    prs,
  };
}

