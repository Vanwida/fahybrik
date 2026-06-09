import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { decodeCoachAssignmentNotes } from '@/lib/dashboard/coach/day-sessions';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — full detail of ONE athlete session (materialized workout_assignment)
// for the coach SessionDrawer: template blocks (read-only reference), decoded
// per-assignment coach overrides (display title + notes) and the athlete's
// execution reality (tiempo, RPE, notas). Reuses the same assignment-detail
// loader as the iOS pre-workout brief — single source of truth for the block
// assembly. Coach-scoped: ownership of the athlete is asserted first.

const SessionIdSchema = z.object({
  session_id: z.string().regex(/^\d+$/, 'session_id inválido'),
});

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; session_id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, session_id } = await ctx.params;

  const parsedAthlete = AthleteIdParamSchema.safeParse({ id });
  if (!parsedAthlete.success) return jsonError('bad_request', 'ID atleta inválido', 400);

  const parsedSession = SessionIdSchema.safeParse({ session_id });
  if (!parsedSession.success) return jsonError('bad_request', 'ID entreno inválido', 400);

  const athleteId = Number(parsedAthlete.data.id);

  const ownership = await sql<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${athleteId} and coach_id = ${session.coach_id}
    limit 1
  `;
  if (!ownership[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  const detail = await loadAssignmentDetail({
    sql,
    athlete_id: BigInt(athleteId),
    assignment_id: BigInt(parsedSession.data.session_id),
  });
  if (!detail) return jsonError('not_found', 'Entreno no encontrado', 404);

  // Coach overrides live encoded in wa.notes (coach_title + free-form body).
  const notesRows = await sql<Array<{ notes: string | null }>>`
    select notes from workout_assignments
    where id = ${Number(parsedSession.data.session_id)}
    limit 1
  `;
  const decoded = decodeCoachAssignmentNotes(notesRows[0]?.notes);

  // Execution reality (duration + athlete notes; RPE/ended_at already in detail).
  const executionRows = await sql<
    Array<{ total_duration_seconds: number | null; notes: string | null }>
  >`
    select total_duration_seconds, notes
    from workout_executions
    where assignment_id = ${Number(parsedSession.data.session_id)}
    limit 1
  `;
  const executionRow = executionRows[0] ?? null;
  const hasExecution =
    executionRow != null ||
    detail.assignment.perceived_exertion != null ||
    detail.assignment.completed_at != null;

  const payload: CoachSessionDetail = {
    assignment_id: detail.assignment.id,
    iso_date: detail.assignment.scheduled_for,
    status: detail.assignment.status,
    display_title: decoded.display_title,
    coach_notes: decoded.notes,
    workout: detail.workout,
    execution: hasExecution
      ? {
          duration_min:
            executionRow?.total_duration_seconds != null
              ? Math.round(executionRow.total_duration_seconds / 60)
              : null,
          rpe: detail.assignment.perceived_exertion,
          athlete_notes: executionRow?.notes ?? null,
          ended_at: detail.assignment.completed_at,
        }
      : null,
  };

  return jsonOk({ session: payload });
}
