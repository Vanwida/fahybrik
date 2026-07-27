import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { decodeCoachAssignmentNotes } from '@/lib/dashboard/coach/day-sessions';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { buildRunCompliance } from '@/lib/dashboard/coach/run-compliance';
import { loadSegmentActuals } from '@/lib/dashboard/coach/session-actuals';
import {
  formatExecutionScore,
  type CoachSessionDetail,
} from '@/lib/dashboard/coach/athlete-session-adapter';

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

  // Coach overrides live encoded in wa.notes (coach_title + free-form body). The
  // same row carries what the drawer needs to tell an EMPTY session from an
  // honest one: who authored it, whether a template is attached at all, its name
  // (a clock's name is its shape) and whether that template is a box CLOCK — the
  // entreno libre run without naming any movement, which persists its
  // prescription on `meta_json` precisely because it has no segments.
  const assignmentRows = await sql<
    Array<{
      notes: string | null;
      origin: 'coach' | 'self';
      template_id: string | null;
      template_name: string | null;
      is_clock: boolean;
    }>
  >`
    select wa.notes,
           wa.origin::text as origin,
           wa.template_id::text as template_id,
           t.name as template_name,
           coalesce(t.meta_json ? 'prescription', false) as is_clock
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.id = ${Number(parsedSession.data.session_id)}
    limit 1
  `;
  const assignmentRow = assignmentRows[0] ?? null;
  const decoded = decodeCoachAssignmentNotes(assignmentRow?.notes);

  // Execution reality (duration + athlete notes; RPE/ended_at already in detail).
  // `id` lets us pull the per-segment actuals the athlete logged for this run.
  const executionRows = await sql<
    Array<{
      id: number;
      total_duration_seconds: number | null;
      notes: string | null;
      score_time_s: number | null;
      score_rounds: number | null;
      score_reps: number | null;
      perceived_difficulty: 'too_easy' | 'as_expected' | 'too_hard' | null;
      pain_area: string | null;
      pain_note: string | null;
    }>
  >`
    select id, total_duration_seconds, notes, score_time_s, score_rounds, score_reps,
           perceived_difficulty, pain_area, pain_note
    from workout_executions
    where assignment_id = ${Number(parsedSession.data.session_id)}
    limit 1
  `;
  const executionRow = executionRows[0] ?? null;

  // Per-exercise actuals (segment_executions). Empty when there's no execution
  // yet or the athlete logged only the aggregate — no fabrication downstream.
  const segmentActuals = executionRow
    ? await loadSegmentActuals(sql, executionRow.id)
    : [];
  const hasExecution =
    executionRow != null ||
    detail.assignment.perceived_exertion != null ||
    detail.assignment.completed_at != null;

  // Why there is (or isn't) content to render — decided once, here, from the same
  // row the drawer's copy depends on. Ordered most-informative first.
  const contentState: CoachSessionDetail['content_state'] =
    detail.workout != null
      ? 'blocks'
      : assignmentRow?.template_id == null
        ? 'no_template'
        : assignmentRow.is_clock
          ? 'clock'
          : 'no_content';

  const payload: CoachSessionDetail = {
    assignment_id: detail.assignment.id,
    iso_date: detail.assignment.scheduled_for,
    status: detail.assignment.status,
    display_title: decoded.display_title,
    coach_notes: decoded.notes,
    workout: detail.workout,
    content_state: contentState,
    origin: assignmentRow?.origin ?? 'coach',
    template_name: assignmentRow?.template_name ?? null,
    execution: hasExecution
      ? {
          duration_min:
            executionRow?.total_duration_seconds != null
              ? Math.round(executionRow.total_duration_seconds / 60)
              : null,
          rpe: detail.assignment.perceived_exertion,
          athlete_notes: executionRow?.notes ?? null,
          ended_at: detail.assignment.completed_at,
          score_label: executionRow
            ? formatExecutionScore({
                score_time_s: executionRow.score_time_s,
                score_rounds: executionRow.score_rounds,
                score_reps: executionRow.score_reps,
              })
            : null,
          perceived_difficulty: executionRow?.perceived_difficulty ?? null,
          pain_area: executionRow?.pain_area ?? null,
          pain_note: executionRow?.pain_note ?? null,
        }
      : null,
    segment_actuals: segmentActuals,
    // Per-tramo running compliance (prescribed band vs executed) — computed from
    // the same assembled blocks + actuals, so verdicts share the coach payload's
    // single source of truth.
    run_compliance: buildRunCompliance(detail.workout, segmentActuals),
  };

  return jsonOk({ session: payload });
}
