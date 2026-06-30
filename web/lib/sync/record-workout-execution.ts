// Record a finished workout execution — the SINGLE source of truth shared by
// the solo sync route (POST /api/sync/workout-execution) and the joint Dobles
// route (POST /api/athlete/dobles/session/[id]/log).
//
// Both paths persist the SAME way: one workout_executions row per assignment
// (upsert on assignment_id), optional per-segment actuals, and the assignment
// flipped to 'completed'. The joint route adds the partner LINK on top (it does
// NOT change how the execution itself is recorded) — so there is one execution
// model, never a forked doubles copy.
//
// The insert here is deliberately partner-agnostic: solo logging never depends
// on the 0074 partner_athlete_id column. The joint route sets that link in a
// follow-up update, keeping the core (solo) loop byte-identical and migration-
// independent.

import { z } from 'zod';
import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { ingestExecutionSegments, segmentInputSchema } from '@/lib/sync/ingest-execution-segments';
import { setAssignmentStatus } from '@/lib/sync/assignment-status';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';

// The measured outcome of a session, WITHOUT the assignment id (the solo route
// carries it in the body; the joint route takes it from the URL path). Shared so
// the two endpoints validate the exact same fields.
export const executionMetricsSchema = z.object({
  perceived_exertion: z.number().int().min(1).max(10).optional(),
  total_duration_seconds: z.number().int().min(0).optional(),
  notes: z.string().max(4000).optional(),
  // Metcon/HYROX final score. score_time_s for For Time / RFT / HYROX-sim;
  // score_rounds (+ score_reps) for AMRAP. Null/omitted for non-scored formats.
  score_time_s: z.number().int().min(0).optional(),
  score_rounds: z.number().int().min(0).optional(),
  score_reps: z.number().int().min(0).optional(),
  // Provenance of the execution as a whole — the `biometric_source` enum.
  // 'manual' for a retroactive log the athlete typed in by hand; omitted (→
  // default 'healthkit') for the live-timer path and older clients. Validated
  // against the exact enum so a stray string can never reach the column.
  source: z
    .enum(['healthkit', 'garmin', 'concept2', 'manual', 'whoop', 'oura', 'polar', 'coros', 'wahoo'])
    .optional(),
  // Session completeness — did the athlete reach the END of the protocol ('full')
  // or TERMINATE early ('partial', the honest "ya no puedo más" save)? Maps 1:1 to
  // the assignment status: full → 'completed', partial → 'partial'. Omitted by the
  // manual "Ya lo hice" log and older clients → defaults to 'full' (completed),
  // preserving prior behaviour. This is the writer mig 0089 deliberately deferred:
  // 'partial' is NEVER a fabricated 'completed'.
  completeness: z.enum(['full', 'partial']).optional(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  // Optional per-segment detail from iOS on workout finish. Upserted by
  // (execution_id, position) so the sync stays idempotent.
  segments: z.array(segmentInputSchema).max(200).optional(),
});

// The solo route's body: metrics + the assignment id the iOS client sends.
export const workoutExecutionSchema = executionMetricsSchema.extend({
  assignment_id: z.union([z.string(), z.number()]),
});

export type ExecutionMetricsInput = z.infer<typeof executionMetricsSchema>;

export type RecordExecutionResult =
  | { ok: false; reason: 'invalid_assignment' | 'not_found' }
  | { ok: true; assignment_id: string; execution_id: string; segments_saved: number };

/**
 * Upsert the workout_executions row for an athlete's assignment, ingest any
 * per-segment actuals, and mark the assignment 'completed' (full protocol) or
 * 'partial' (terminated early), per `input.completeness`. Ownership-scoped: the
 * assignment MUST belong to the athlete (else `not_found`). Idempotent — a
 * retried sync merges by assignment_id / (execution_id, position).
 */
export async function recordWorkoutExecution(args: {
  athleteId: number;
  assignmentId: number;
  input: ExecutionMetricsInput;
  // Accepts a transaction client so callers (e.g. the entreno-libre save) can run
  // the recording inside their OWN transaction; defaults to the pool otherwise.
  sql?: Sql | TransactionClient;
}): Promise<RecordExecutionResult> {
  const sql = args.sql ?? defaultSql;
  const { athleteId, assignmentId, input } = args;

  if (!Number.isFinite(assignmentId)) return { ok: false, reason: 'invalid_assignment' };

  const owned = await sql<Array<{ id: string }>>`
    select wa.id::text
    from workout_assignments wa
    where wa.id = ${assignmentId} and wa.athlete_id = ${athleteId}
    limit 1
  `;
  if (!owned[0]) return { ok: false, reason: 'not_found' };

  const startedAt = input.started_at ?? new Date().toISOString();
  const endedAt = input.ended_at ?? new Date().toISOString();

  const execRows = await sql<Array<{ id: string }>>`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at,
      total_duration_seconds, perceived_exertion, notes,
      score_time_s, score_rounds, score_reps, source
    )
    values (
      ${assignmentId},
      ${athleteId},
      ${startedAt}::timestamptz,
      ${endedAt}::timestamptz,
      ${input.total_duration_seconds ?? null},
      ${input.perceived_exertion ?? null},
      ${input.notes ?? null},
      ${input.score_time_s ?? null},
      ${input.score_rounds ?? null},
      ${input.score_reps ?? null},
      ${input.source ?? 'healthkit'}::biometric_source
    )
    on conflict (assignment_id) do update set
      perceived_exertion = coalesce(excluded.perceived_exertion, workout_executions.perceived_exertion),
      total_duration_seconds = coalesce(excluded.total_duration_seconds, workout_executions.total_duration_seconds),
      notes = coalesce(excluded.notes, workout_executions.notes),
      score_time_s = coalesce(excluded.score_time_s, workout_executions.score_time_s),
      score_rounds = coalesce(excluded.score_rounds, workout_executions.score_rounds),
      score_reps = coalesce(excluded.score_reps, workout_executions.score_reps),
      ended_at = coalesce(excluded.ended_at, workout_executions.ended_at),
      updated_at = now()
    returning id::text
  `;
  const executionId = Number(execRows[0]?.id);

  let segmentsSaved = 0;
  if (Number.isFinite(executionId) && input.segments && input.segments.length > 0) {
    segmentsSaved = await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: startedAt,
      segments: input.segments,
    });
  }

  // Earned, not assumed: 'completed' ONLY when the protocol ran to the end;
  // 'partial' when the athlete terminated early. Older clients omit completeness
  // → 'full' → 'completed' (unchanged behaviour).
  const assignmentStatus = input.completeness === 'partial' ? 'partial' : 'completed';
  await setAssignmentStatus(sql, assignmentId, athleteId, assignmentStatus);

  // Fire-and-forget: refresh the coach attention queue for this athlete (a
  // completed workout can clear missed_sessions / compliance signals). Never
  // throws into the sync response.
  void recomputeAthlete({ athlete_id: athleteId }).catch(() => {});

  return {
    ok: true,
    assignment_id: String(assignmentId),
    execution_id: String(executionId),
    segments_saved: segmentsSaved,
  };
}
