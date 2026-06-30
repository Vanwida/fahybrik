// Single source of truth for "did this assignment get done?".
//
// `workout_executions` has NO status column. Whether a session reads as DONE vs
// PENDING lives entirely in `workout_assignments.status`. The mere EXISTENCE of
// an execution row does not make a session done — the assignment must be flipped.
// Historically only the manual / live-timer recorder flipped it, so device-sync
// ingests (HealthKit, Garmin) filed an execution but left the assignment
// 'scheduled' → the athlete still saw "Empezar" on a workout they'd finished.
// Both writers now route through this module so the rule lives in ONE place.

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

/**
 * DEVICE-INGEST flip — a synced wearable workout (HealthKit / Garmin) PROVES the
 * session was performed. We promote a still-'scheduled' assignment to
 * 'completed'. We deliberately do NOT clobber an explicit decision already on the
 * row: a manual 'partial' (the honest "ya no puedo más" save), a manual
 * 'completed', or a coach 'skipped' / 'missed' all stand — a later passive sync
 * must never silently overwrite them. Hence the `status = 'scheduled'` guard.
 */
export async function markAssignmentDoneFromDevice(
  sql: Sql | TransactionClient,
  assignmentId: number | string,
  athleteId: number | bigint,
): Promise<void> {
  await sql`
    update workout_assignments
    set status = 'completed'::assignment_status, updated_at = now()
    where id = ${assignmentId as unknown as number}
      and athlete_id = ${athleteId as unknown as number}
      and status = 'scheduled'::assignment_status
  `;
}
