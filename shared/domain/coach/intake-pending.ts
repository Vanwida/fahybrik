// Single source of truth for the "intake pendiente" derivation.
//
// An athlete is awaiting coach intake-review when they have FINISHED onboarding
// (onboarded_at set) but the coach has NOT yet reviewed/committed their intake
// (intake_completed_at still null). This is the exact condition the
// listPendingIntake query filters on — keep them in sync via this helper so the
// home queue, the athlete ficha banner, and the list badge never disagree.

export interface IntakePendingInput {
  /** Timestamp the athlete completed onboarding (ISO string, Date, or null). */
  onboarded_at: string | Date | null | undefined;
  /** Timestamp the coach committed intake-review (ISO string, Date, or null). */
  intake_completed_at: string | Date | null | undefined;
}

/**
 * True when the athlete finished onboarding but the coach hasn't reviewed the
 * intake yet. Mirrors `intake_completed_at IS NULL AND onboarded_at IS NOT NULL`.
 */
export function isIntakePending(input: IntakePendingInput): boolean {
  return input.onboarded_at != null && input.intake_completed_at == null;
}
