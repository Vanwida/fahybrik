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
import {
  ingestExecutionSegments,
  segmentDurationSeconds,
  segmentInputSchema,
} from '@/lib/sync/ingest-execution-segments';
import { deriveExecutionProvenance } from '@fahybrid/shared/domain/execution-merge';
import { biometricSource, executionRecordingMethod } from '@fahybrid/shared/schema';
import { polylinePointCount } from '@/lib/sync/polyline';
import { setAssignmentStatus } from '@/lib/sync/assignment-status';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';
import { computeSessionTotals } from '@/lib/execution/session-totals';
import { detectExecutionRunningPRs } from '@/lib/sync/running-prs';
import type { RunningPR } from '@fahybrid/shared/domain/running/best-efforts';

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
  // WHICH APPARATUS the numbers came from — the `biometric_source` enum, shared
  // with the DB type so a stray string can never reach the column. Only a HINT:
  // when the tramos name a real apparatus, that measured evidence wins (see
  // `deriveExecutionProvenance`). This is what stops the live path — which sends
  // 'manual' — from labelling a PM5 session as hand-typed.
  source: biometricSource.optional(),
  // HOW the record came to exist: 'live' (run in the app, the engine timed it),
  // 'manual' (typed in afterwards) or 'imported' (ingested from a third party).
  // A different question from `source`, and the reason four real live sessions
  // read as «A mano». Omitted by older clients → derived from the tramos.
  recorded_via: executionRecordingMethod.optional(),
  // The device workout this structured execution corresponds to — the HKWorkout
  // UUID the watch stamped when it saved the session to HealthKit. Persisted to
  // workout_executions.source_workout_ref so the passive HealthKit ingest can
  // recognise the SAME workout arriving via /api/sync/healthkit and NOT re-link
  // it to a different same-day assignment (the AM-run-marks-PM-done double-count
  // bug). snake_case wire; nullish for manual logs / older clients that omit it.
  source_workout_ref: z.string().max(200).nullish(),
  // Session completeness — did the athlete reach the END of the protocol ('full')
  // or TERMINATE early ('partial', the honest "ya no puedo más" save)? Maps 1:1 to
  // the assignment status: full → 'completed', partial → 'partial'. Omitted by the
  // manual "Ya lo hice" log and older clients → defaults to 'full' (completed),
  // preserving prior behaviour. This is the writer mig 0089 deliberately deferred:
  // 'partial' is NEVER a fabricated 'completed'.
  completeness: z.enum(['full', 'partial']).optional(),
  // Structured post-workout feedback (mig 0125). All additive/optional so the
  // installed app that never sends them keeps writing NULLs.
  //   · perceived_difficulty — calibration verdict vs what the plan intended.
  //   · pain_area / pain_note — earliest injury signal: a body area that hurt +
  //     an optional detail. Generic vocabulary (no brand/coach names).
  perceived_difficulty: z.enum(['too_easy', 'as_expected', 'too_hard']).optional(),
  pain_area: z.enum(['rodilla', 'tobillo', 'cadera', 'espalda', 'hombro', 'otra']).nullish(),
  pain_note: z.string().max(500).nullish(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  // The outdoor run's GPS trace (#64) as a Google ENCODED POLYLINE (precision 5).
  // Stored verbatim in workout_routes (server derives point_count); the 200 KB cap
  // matches the column CHECK and covers even a long run. Omitted for indoor sessions.
  route_polyline: z.string().max(200_000).optional(),
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
  | {
      ok: true;
      assignment_id: string;
      execution_id: string;
      segments_saved: number;
      // Running records this session set (1k/3k/5k). Empty when the session had
      // no eligible run effort. Additive — older clients simply ignore it.
      prs: RunningPR[];
    };

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

  // Fetch the session's format alongside the ownership check — it is the effort
  // CONTEXT fallback (migration 0120) for segments that carry no template link.
  // LEFT JOIN so ownership never depends on the template still existing.
  const owned = await sql<Array<{ id: string; session_format: string | null }>>`
    select wa.id::text, t.format::text as session_format
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.id = ${assignmentId} and wa.athlete_id = ${athleteId}
    limit 1
  `;
  if (!owned[0]) return { ok: false, reason: 'not_found' };
  const sessionFormat = owned[0].session_format;

  const startedAt = input.started_at ?? new Date().toISOString();
  const endedAt = input.ended_at ?? new Date().toISOString();

  // WHICH apparatus produced the numbers, and HOW the record came to exist —
  // derived HERE, on the server, from the tramos the client just posted. Never
  // taken on trust: the live engine declares source='manual' while posting PM5
  // and treadmill tramos, and believing it is what wrote «A mano» over four real
  // sessions. The tramos are the evidence; this reads them (mig 0143 + 0144).
  const provenance = deriveExecutionProvenance({
    segments: (input.segments ?? []).map((seg) => ({
      source: seg.source,
      duration_seconds: segmentDurationSeconds(seg),
    })),
    declared_source: input.source ?? null,
    declared_recorded_via: input.recorded_via ?? null,
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
      ${input.total_duration_seconds ?? null},
      ${input.perceived_exertion ?? null},
      ${input.notes ?? null},
      ${input.score_time_s ?? null},
      ${input.score_rounds ?? null},
      ${input.score_reps ?? null},
      ${provenance.source}::biometric_source,
      ${input.source_workout_ref ?? null},
      ${input.perceived_difficulty ?? null},
      ${input.pain_area ?? null},
      ${input.pain_note ?? null},
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
      -- UNION, never replace: a second sync can bring a tramo from ANOTHER
      -- apparatus (the erg arrives after the watch), and the ones already
      -- recorded did contribute. Aggregated in enum order so the stored array
      -- matches what the 0144 backfill produces for the same set.
      contributing_sources = (
        select coalesce(array_agg(distinct s order by s), '{}'::biometric_source[])
        from unnest(workout_executions.contributing_sources || excluded.contributing_sources) as s
      ),
      updated_at = now()
    returning id::text
  `;
  const executionId = Number(execRows[0]?.id);

  // The outdoor run's GPS route (#64) — one per execution (UNIQUE), upserted so a
  // re-sync replaces rather than duplicates. Additive: an indoor session omits it and
  // no row is written. point_count is derived here (the wire ships only the polyline).
  if (Number.isFinite(executionId) && input.route_polyline && input.route_polyline.length > 0) {
    await sql`
      insert into workout_routes (execution_id, polyline, point_count)
      values (${executionId}, ${input.route_polyline}, ${polylinePointCount(input.route_polyline)})
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

  // Totales de cabecera (FC media/máxima, distancia total, calorías) — card 126.
  // Recalculados SIEMPRE, no solo cuando este payload trae tramos: una llamada
  // sin `segments` (p.ej. una corrección de RPE) puede llegar después de que la
  // traza de pulso ya esté guardada, y este recálculo tiene que verla. Corre
  // DESPUÉS de `ingestExecutionSegments` a propósito — ver el comentario de
  // cabecera de `session-totals.ts` sobre por qué no viven en el INSERT/ON
  // CONFLICT de arriba. Nunca lanza hacia la respuesta del sync.
  if (Number.isFinite(executionId)) {
    await computeSessionTotals({ execution_id: executionId, client: sql }).catch(() => {});
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

  // Running records this session set (1k/3k/5k). Computed on the SAME client so
  // the just-ingested segments are visible; never throws into the sync response.
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
