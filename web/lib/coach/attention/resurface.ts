// Override suppression — decides whether a live attention signal should stay
// hidden because the coach snoozed it / marked it done, or should RESURFACE
// because the situation changed since they did (SPEC §9 "snooze/dismiss con
// resurface inteligente"; plan §1: posponer 1 d / 3 d / hasta nueva señal).
//
// Pure & framework-free so the readers can apply it in TS over the indexed read
// and a Vitest suite can exercise every branch without a DB.

import {
  SIGNAL_SEVERITY_RANK,
  type SignalSeverity,
} from '@fahybrid/shared/domain/coach/signals';

/** The live attention item (subset of coach_attention_items we reason over). */
export interface SuppressionItem {
  signal_kind: string;
  severity: SignalSeverity;
  value_numeric: number | null;
  /** The item's current identity (proposal / comunicado / episode suffix). */
  dedupe_key?: string | null;
}

/** The coach's override row (subset of coach_alert_overrides), or null. */
export interface SuppressionOverride {
  snoozed_until: Date | null;
  dismissed_at: Date | null;
  resurface_on_new_signal: boolean;
  /** The item's value_numeric at the moment the coach dismissed/snoozed it. */
  baseline_value_at_override: number | null;
  /** The item's severity at that moment (mig 0212). null = legacy row. */
  severity_at_override?: SignalSeverity | null;
  /** The item's dedupe_key at that moment (mig 0212). null = legacy row. */
  dedupe_key?: string | null;
}

/**
 * Minimum worsening of the value (relative to the value captured at override)
 * that counts as a "meaningful step" and resurfaces a dismissed signal even when
 * the severity tier has not changed. A 25 % move in the worsening direction.
 */
const RESURFACE_VALUE_GROWTH_FRACTION = 0.25;

/**
 * Which way is "worse" for each kind's `value_numeric`. Readiness is a score
 * (lower = worse) and the HRV delta is negative when suppressed; everything else
 * counts things that pile up (days, sessions, hours). Kinds whose value is not a
 * magnitude (proposals, flags) resurface only by tier or by a new identity.
 */
const LOWER_IS_WORSE = new Set(['readiness_low', 'hrv_crash']);
const NO_MAGNITUDE = new Set([
  'programming_status',
  'transition_ready',
  'week_adjustment_pending',
  'monthly_block_pending',
  'intake_pending',
  'billing_at_risk',
]);

function escalated(item: SuppressionItem, override: SuppressionOverride): boolean {
  const before = override.severity_at_override;
  if (before == null) {
    // Legacy row without the captured tier: only a critical item can be an
    // escalation, and only if the value also moved (else a critical dismissed
    // item would pop back instantly — the pre-0212 bug).
    return false;
  }
  return SIGNAL_SEVERITY_RANK[item.severity] < SIGNAL_SEVERITY_RANK[before];
}

/**
 * Whether `item` should be hidden from the queue given the coach's `override`.
 *
 * Rules (in order):
 *  1. No override → NOT suppressed.
 *  2. Timed snooze in effect (`snoozed_until` in the future) → suppressed, unless
 *     the item ESCALATED to a worse tier since (a warning that became critical
 *     breaks through: the coach said «in 3 days», not «even if it gets worse»).
 *  3. Dismissed (`dismissed_at` set — «hecho» or «hasta nueva señal»):
 *     a. `resurface_on_new_signal === false` → always suppressed.
 *     b. A NEW instance (different `dedupe_key`: another proposal, comunicado or
 *        readiness episode) → NOT suppressed.
 *     c. Worsened since: tier escalation, or the value moved ≥ 25 % in the
 *        worsening direction → NOT suppressed.
 *     d. Otherwise suppressed.
 *  4. Override row exists but neither is active (expired snooze) → NOT suppressed.
 */
export function isSuppressed(
  item: SuppressionItem,
  override: SuppressionOverride | null,
  now: Date,
): boolean {
  if (!override) return false;

  if (override.snoozed_until && override.snoozed_until.getTime() > now.getTime()) {
    return !escalated(item, override);
  }

  if (override.dismissed_at) {
    if (!override.resurface_on_new_signal) return true;
    if (
      override.dedupe_key != null &&
      item.dedupe_key != null &&
      override.dedupe_key !== item.dedupe_key
    ) {
      return false;
    }
    return !hasWorsenedSinceDismiss(item, override);
  }

  return false;
}

/** Has the live signal worsened enough since the coach dismissed it? */
function hasWorsenedSinceDismiss(item: SuppressionItem, override: SuppressionOverride): boolean {
  if (escalated(item, override)) return true;
  if (NO_MAGNITUDE.has(item.signal_kind)) return false;

  const baseline = override.baseline_value_at_override;
  const current = item.value_numeric;
  if (baseline == null || current == null) return false;

  if (LOWER_IS_WORSE.has(item.signal_kind)) {
    // Worse = lower. Relative to the magnitude of the captured value.
    const mag = Math.abs(baseline);
    if (mag === 0) return current < 0;
    return (baseline - current) / mag >= RESURFACE_VALUE_GROWTH_FRACTION;
  }

  // Worse = bigger (days, sessions, hours).
  const baselineMag = Math.abs(baseline);
  const currentMag = Math.abs(current);
  if (baselineMag === 0) return currentMag > 0;
  return (currentMag - baselineMag) / baselineMag >= RESURFACE_VALUE_GROWTH_FRACTION;
}

/** Re-exported so callers can reason over the same rank without re-importing. */
export { SIGNAL_SEVERITY_RANK };
