import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import {
  ingestExecutionSegments,
  segmentInputSchema,
} from '@/lib/sync/ingest-execution-segments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const workoutExecutionSchema = z.object({
  assignment_id: z.union([z.string(), z.number()]),
  perceived_exertion: z.number().int().min(1).max(10).optional(),
  total_duration_seconds: z.number().int().min(0).optional(),
  notes: z.string().max(4000).optional(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  // Optional per-segment detail from iOS on workout finish. Upserted by
  // (execution_id, position) so the sync stays idempotent.
  segments: z.array(segmentInputSchema).max(200).optional(),
});

export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = workoutExecutionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const assignmentId = Number(parsed.data.assignment_id);
  if (!Number.isFinite(assignmentId)) {
    return jsonError('bad_request', 'invalid assignment_id', 400);
  }

  const athleteId = Number(auth.athlete_id);

  const owned = await sql<Array<{ id: string }>>`
    select wa.id::text
    from workout_assignments wa
    where wa.id = ${assignmentId} and wa.athlete_id = ${athleteId}
    limit 1
  `;
  if (!owned[0]) return jsonError('not_found', 'Assignment not found', 404);

  const startedAt = parsed.data.started_at ?? new Date().toISOString();
  const endedAt = parsed.data.ended_at ?? new Date().toISOString();

  const execRows = await sql<Array<{ id: string }>>`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at,
      total_duration_seconds, perceived_exertion, notes, source
    )
    values (
      ${assignmentId},
      ${athleteId},
      ${startedAt}::timestamptz,
      ${endedAt}::timestamptz,
      ${parsed.data.total_duration_seconds ?? null},
      ${parsed.data.perceived_exertion ?? null},
      ${parsed.data.notes ?? null},
      'healthkit'
    )
    on conflict (assignment_id) do update set
      perceived_exertion = coalesce(excluded.perceived_exertion, workout_executions.perceived_exertion),
      total_duration_seconds = coalesce(excluded.total_duration_seconds, workout_executions.total_duration_seconds),
      notes = coalesce(excluded.notes, workout_executions.notes),
      ended_at = coalesce(excluded.ended_at, workout_executions.ended_at),
      updated_at = now()
    returning id::text
  `;
  const executionId = Number(execRows[0]?.id);

  let segmentsSaved = 0;
  if (Number.isFinite(executionId) && parsed.data.segments && parsed.data.segments.length > 0) {
    segmentsSaved = await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: startedAt,
      segments: parsed.data.segments,
    });
  }

  await sql`
    update workout_assignments
    set status = 'completed', updated_at = now()
    where id = ${assignmentId} and athlete_id = ${athleteId}
  `;

  return jsonOk({
    saved: true,
    assignment_id: String(assignmentId),
    execution_id: String(executionId),
    segments_saved: segmentsSaved,
  });
}
