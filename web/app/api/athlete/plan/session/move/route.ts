// POST /api/athlete/plan/session/move
//
// The authenticated athlete moves ONE of their own sessions to another day
// WITHIN the same week. We update `scheduled_for` only — never the planned order.
//
// DESIGN
// ------
// - `scheduled_for` is NOT unique: two-a-days are valid (disambiguated by the
//   `notes` slot). Moving onto an already-occupied day is intentional and allowed;
//   we only ever UPDATE the athlete's own single row, so we can never clobber
//   another session — clobber-safe by construction.
// - We edit only the athlete's own assignment row, which post-bifurcation (0083)
//   is already a per-athlete template instance. Library templates and every other
//   athlete are untouched. The athlete-scoped WHERE is the isolation boundary.
// - `planned_sequence` is FROZEN before the move (lazy backfill of any nulls in
//   the whole microcycle, capturing the order JUST BEFORE this move) and is NOT
//   changed by the move. That is the whole point: moving a day must never change
//   the planned order. Order-altered completion detection (read side, elsewhere)
//   compares completion order against this frozen sequence.

import { z } from 'zod';
import { sql } from '@/lib/db';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The zod regex only checks SHAPE; this rejects shaped-but-impossible dates
// (e.g. 2026-02-30) by round-tripping through a UTC date and comparing parts.
function isRealCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    dt.getUTCFullYear() === Number(y) &&
    dt.getUTCMonth() === Number(mo) - 1 &&
    dt.getUTCDate() === Number(d)
  );
}

const moveSessionSchema = z.object({
  assignment_id: z.number().int().positive(),
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealCalendarDate, { message: 'to_date is not a real calendar date' }),
});

type AssignmentRow = {
  id: string;
  status: string;
  scheduled_for: string; // YYYY-MM-DD
  microcycle_id: string | null;
  planned_sequence: number | null;
  start_date: string | null; // YYYY-MM-DD (null when no microcycle)
  end_date: string | null; // YYYY-MM-DD (null when no microcycle)
};

type MovedRow = {
  id: string;
  scheduled_for: string; // YYYY-MM-DD
  planned_sequence: number | null;
  status: string;
};

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

  const parsed = moveSessionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Invalid move payload', 422, parsed.error.flatten());
  }

  const athleteId = Number(session.athlete_id);
  const { assignment_id: assignmentId, to_date: toDate } = parsed.data;

  try {
    // Athlete-scoped load: the WHERE on athlete_id IS the isolation — another
    // athlete's session simply doesn't match and reads as not_found.
    const rows = await sql<AssignmentRow[]>`
      select
        wa.id::text            as id,
        wa.status::text        as status,
        wa.scheduled_for::text as scheduled_for,
        wa.microcycle_id::text as microcycle_id,
        wa.planned_sequence    as planned_sequence,
        m.start_date::text     as start_date,
        m.end_date::text       as end_date
      from workout_assignments wa
      left join microcycles m on m.id = wa.microcycle_id
      where wa.id = ${assignmentId} and wa.athlete_id = ${athleteId}
      limit 1
    `;
    const row = rows[0];
    if (!row) {
      return jsonError('not_found', 'Session not found', 404);
    }

    // A completed session can't be moved: it's meaningless and would distort
    // completion-order detection.
    if (row.status === 'completed') {
      return jsonError('conflict', 'A completed session cannot be moved', 409);
    }

    // Allowed week range. With a microcycle: its inclusive [start, end]. Without
    // one (legacy/orphan row): the Mon–Sun ISO week of the current scheduled_for.
    // ISO YYYY-MM-DD strings compare lexicographically == chronologically.
    let weekStart: string;
    let weekEnd: string;
    if (row.microcycle_id !== null && row.start_date && row.end_date) {
      weekStart = row.start_date;
      weekEnd = row.end_date;
    } else {
      const monday = mondayOfWeek(parseIsoDate(row.scheduled_for));
      weekStart = isoDateString(monday);
      weekEnd = isoDateString(addDays(monday, 6));
    }

    if (toDate < weekStart || toDate > weekEnd) {
      return jsonError('out_of_range', 'Target day is outside this week of the plan', 422);
    }

    const microcycleId = row.microcycle_id;

    const moved = await sql.begin(async (tx) => {
      // LAZY FREEZE (microcycle rows only): fill any null planned_sequence across
      // the WHOLE microcycle so the frozen order reflects the state JUST BEFORE
      // this move. Idempotent — only touches nulls; ranking matches migration 0086.
      if (microcycleId !== null) {
        await tx`
          with planned as (
            select
              id,
              row_number() over (
                partition by athlete_id, microcycle_id
                order by scheduled_for asc, id asc
              ) as seq
            from workout_assignments
            where microcycle_id = ${microcycleId}::bigint
          )
          update workout_assignments wa
          set planned_sequence = planned.seq
          from planned
          where planned.id = wa.id and wa.planned_sequence is null
        `;
      }

      // MOVE: change the day only. planned_sequence is deliberately left frozen.
      const updated = await tx<MovedRow[]>`
        update workout_assignments
        set scheduled_for = ${toDate}::date, updated_at = now()
        where id = ${assignmentId} and athlete_id = ${athleteId}
        returning
          id::text            as id,
          scheduled_for::text as scheduled_for,
          planned_sequence    as planned_sequence,
          status::text        as status
      `;
      return updated[0];
    });

    if (!moved) {
      return jsonError('not_found', 'Session not found', 404);
    }

    return jsonOk({
      session: {
        id: moved.id,
        scheduled_for: moved.scheduled_for,
        planned_sequence: moved.planned_sequence,
        status: moved.status,
      },
    });
  } catch (err) {
    console.error('[POST /api/athlete/plan/session/move]', err);
    return jsonError('internal_error', 'Failed to move session', 500);
  }
}
