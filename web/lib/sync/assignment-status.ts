// Single source of truth for "did this assignment get done?".
//
// `workout_executions` has NO status column. Whether a session reads as DONE vs
// PENDING lives entirely in `workout_assignments.status`. The mere EXISTENCE of
// an execution row does not make a session done — the assignment must be flipped
// by an explicit save (live finish, "Marcar como hecha", test battery).
//
// A passive device import (HealthKit / Garmin / Polar, recorded_via='imported')
// may file an execution for analytics. It does NOT flip status. Hecho is the
// athlete wanting to save, not a leftover HKWorkout landing on the day's only
// assignment (card 183). Do not reopen "entreno hecho sigue Empezar" by putting
// a device flip back: recordWorkoutExecution already calls setAssignmentStatus.

import type { Sql, TransactionClient } from '@/lib/db';

/** The two states an actually-performed session can land in. */
export type DoneStatus = 'completed' | 'partial';

/**
 * AUTHORITATIVE flip — the manual / live-timer / Dobles / free-workout recorder.
 * The athlete (or coach) explicitly logged the session, so we set the exact
 * status they earned: 'completed' (ran to the end) or 'partial' (terminated
 * early). Ownership-scoped; unconditional (this writer IS the source of truth).
 */
export async function setAssignmentStatus(
  sql: Sql | TransactionClient,
  assignmentId: number,
  athleteId: number,
  status: DoneStatus,
): Promise<void> {
  await sql`
    update workout_assignments
    set status = ${status}::assignment_status, updated_at = now()
    where id = ${assignmentId} and athlete_id = ${athleteId}
  `;
}
