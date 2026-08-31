// POST /api/athlete/plan/session/reset
//
// "Deshacer hecho" — the authenticated athlete resets ONE of their own sessions
// from a finished state (completed / partial) back to PENDIENTE (scheduled),
// undoing a mark or a log made by mistake. The genuinely-new piece of the
// session-state correction layer (concept §H.2 / §I): nothing else can un-mark a
// session — the recorder only ever flips status FORWARD to completed.
//
// DESIGN
// ------
// - Athlete-scoped by construction: every query carries `and athlete_id = …`, so
//   another athlete's session simply reads as not_found (same isolation boundary
//   as the move route).
// - Only `completed` / `partial` are undoable. `scheduled` is an idempotent no-op
//   (re-tapping undo is harmless). `missed` / `skipped` are not "hechos" and have
//   no undo path here (the row menu never offers it) → 409.
// - DESTRUCTIVE GATE lives on the SERVER, which is the only thing that knows what
//   the execution actually holds. A pure "Marcar como hecha" mark (source=manual,
//   every metric NULL, no segments) carries NO recorded work → reset is clean,
//   no confirmation. An execution with real measured data (duration / RPE / score
//   / per-segment laps) DOES → we refuse with 409 `needs_confirmation` unless the
//   client passes `confirm: true`. The client never guesses "is there real work";
//   it reacts to the server's verdict.
// - On reset we DELETE the linked workout_executions row. The FK
//   `segment_executions.execution_id → workout_executions on delete cascade`
//   (and `set_executions → segment_executions` likewise) carries the per-segment
//   detail with it, so undo leaves no orphaned execution rows.

import { z } from 'zod';
import { sql } from '@/lib/db';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { verdictForSessionReset } from '@/lib/athlete/session-reset';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const resetSessionSchema = z.object({
  assignment_id: z.number().int().positive(),
  // When the linked execution holds real recorded work, the destructive reset is
  // only performed if the client explicitly confirms. Defaults false → the server
  // returns 409 needs_confirmation and deletes NOTHING.
  confirm: z.boolean().optional().default(false),
});

type AssignmentRow = { id: string; status: string };
type ExecutionRow = { execution_id: string; has_recorded_work: boolean };

export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) {
    return jsonError('unauthorized', 'Athlete bearer required', 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'Body must be valid JSON', 400);
  }

  const parsed = resetSessionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Invalid reset payload', 422, parsed.error.flatten());
  }

  const athleteId = Number(session.athlete_id);
  const { assignment_id: assignmentId, confirm } = parsed.data;

  try {
    const rows = await sql<AssignmentRow[]>`
      select wa.id::text as id, wa.status::text as status
      from workout_assignments wa
      where wa.id = ${assignmentId} and wa.athlete_id = ${athleteId}
      limit 1
    `;
    const row = rows[0];
    if (!row) {
      return jsonError('not_found', 'Session not found', 404);
    }

    // What does the linked execution actually hold? (NULL row → no execution,
    // e.g. status set without a sync — then there is nothing destructive to lose.)
    const execRows = await sql<ExecutionRow[]>`
      select
        we.id::text as execution_id,
        (
          we.total_duration_seconds is not null
          or we.perceived_exertion is not null
          or we.notes is not null
          or we.score_time_s is not null
          or we.score_rounds is not null
          or we.score_reps is not null
          or exists (select 1 from segment_executions se where se.execution_id = we.id)
        ) as has_recorded_work
      from workout_executions we
      where we.assignment_id = ${assignmentId} and we.athlete_id = ${athleteId}
      limit 1
    `;
    const exec = execRows[0];
    const hasRecordedWork = exec?.has_recorded_work ?? false;
    const verdict = verdictForSessionReset({
      status: row.status,
      hasRecordedWork,
      confirm,
    });

    if (verdict.action === 'already_scheduled') {
      return jsonOk({ reset: true, status: 'scheduled', deleted_execution: false });
    }
    if (verdict.action === 'not_undoable') {
      return jsonError('conflict', 'This session has no completion to undo', 409);
    }
    // Real measured work + no explicit confirm → refuse, deleting nothing. The
    // client shows the destructive confirm and retries with confirm: true.
    if (verdict.action === 'needs_confirmation') {
      return jsonError(
        'needs_confirmation',
        'This session has recorded work that will be permanently deleted',
        409,
        { has_recorded_work: true },
      );
    }

    const deletedExecution = await sql.begin(async (tx) => {
      // Delete the execution first; segment_executions / set_executions follow via
      // ON DELETE CASCADE. Athlete-scoped so it can only ever touch the caller's row.
      const deleted = await tx<Array<{ id: string }>>`
        delete from workout_executions
        where assignment_id = ${assignmentId} and athlete_id = ${athleteId}
        returning id::text as id
      `;
      // Back to pendiente — the only state that means "not done, not recorded".
      await tx`
        update workout_assignments
        set status = 'scheduled', updated_at = now()
        where id = ${assignmentId} and athlete_id = ${athleteId}
      `;
      return deleted.length > 0;
    });

    // Fire-and-forget: an undone completion can re-introduce a missed/compliance
    // signal — keep the coach attention queue in sync (mirrors the recorder).
    void recomputeAthlete({ athlete_id: athleteId }).catch(() => {});

    return jsonOk({ reset: true, status: 'scheduled', deleted_execution: deletedExecution });
  } catch (err) {
    console.error('[POST /api/athlete/plan/session/reset]', err);
    return jsonError('internal_error', 'Failed to reset session', 500);
  }
}
