// Order-altered completion — did the athlete complete their week's sessions OUT
// of the planned sequence? This is distinct from ./completion (HOW MANY of the
// due sessions got done) and ./bands (HOW WELL a single session hit its target):
// it judges the ORDER in which the done sessions were finished.
//
// The baseline is `planned_sequence` (workout_assignments, migration 0086): the
// frozen 1..N rank a session held in the coach's ORIGINAL weekly plan. Merely
// MOVING a session to another day is NOT a violation — only finishing an
// earlier-planned session AFTER a later-planned one is. This is a pure function;
// the read layer supplies the completion timestamps and frozen sequences.

export interface CompletedSessionOrder {
  /** frozen planned position within the week (1..N) */
  planned_sequence: number;
  /** unix epoch seconds of actual completion (coalesce ended_at, started_at) */
  completed_at: number;
}

/**
 * True when the athlete completed sessions OUT of their planned sequence.
 * Moving a session to another day but completing in planned order => false.
 * Completing an earlier-planned session AFTER a later-planned one => true.
 * Needs >=2 completions to ever be true. Ties in completed_at are not violations.
 */
export function isOrderAltered(completed: CompletedSessionOrder[]): boolean {
  // Sort a COPY by actual completion time ascending; tie-break by planned_sequence
  // ascending so simultaneous completions are read in planned order and never
  // register as a violation.
  const byCompletion = [...completed].sort(
    (a, b) =>
      a.completed_at - b.completed_at || a.planned_sequence - b.planned_sequence,
  );

  // Walk completions in time order: a violation is any session whose planned_
  // sequence is STRICTLY smaller than that of a session already completed before
  // it (an inversion vs the running high-water mark).
  let prevSeq = Number.NEGATIVE_INFINITY;
  for (const session of byCompletion) {
    if (session.planned_sequence < prevSeq) return true;
    prevSeq = session.planned_sequence;
  }
  return false;
}
