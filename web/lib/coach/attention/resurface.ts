// Override suppression — decides whether a live attention signal should stay
// hidden because the coach snoozed or dismissed it, or should RESURFACE because
// the situation has materially worsened since they did (SPEC §9 "snooze/dismiss
// con resurface inteligente").
//
// Pure & framework-free so queue.ts can apply it in TS over the indexed read and
// a Vitest suite can exercise every branch without a DB.

import {
  SIGNAL_SEVERITY_RANK,
  type SignalSeverity,
} from '@fahybrid/shared/domain/coach/signals';

/** The live attention item (subset of coach_attention_items we reason over). */
export interface SuppressionItem {
  signal_kind: string;
  severity: SignalSeverity;
  value_numeric: number | null;
}

/** The coach's override row (subset of coach_alert_overrides), or null. */
export interface SuppressionOverride {
  snoozed_until: Date | null;
  dismissed_at: Date | null;
  resurface_on_new_signal: boolean;
  /** The item's value_numeric at the moment the coach dismissed/snoozed it. */
  baseline_value_at_override: number | null;
}

/**
 * Minimum worsening of |value| (relative to the value captured at override)
 * that counts as a "meaningful step" and resurfaces a dismissed signal even
 * when the severity tier has not changed. Expressed as a fraction: a 25% growth
 * in magnitude in the worsening direction is treated as a fresh escalation.
 *
 * Kept as a single named constant (no magic numbers): the rule is intentionally
 * coarse — the precise per-signal threshold crossing already lives in the
 * evaluators; this is only the resurface heuristic for the value-only path.
 */
const RESURFACE_VALUE_GROWTH_FRACTION = 0.25;

/**
 * Whether `item` should be hidden from the queue given the coach's `override`.
 *
 * Rules (in order):
 *  1. No override → NOT suppressed.
 *  2. Snooze active (`snoozed_until` in the future) → suppressed. An expired
 *     snooze (in the past) does NOT suppress.
 *  3. Dismissed (`dismissed_at` set):
 *     a. `resurface_on_new_signal === false` → ALWAYS suppressed (coach said
 *        "never mind this one").
 *     b. `resurface_on_new_signal === true` → resurface (NOT suppressed) when
 *        the live signal has materially worsened since dismissal, meaning EITHER
 *        - it is now `critical` (a tier it was not, since the coach would not
 *          have left a critical item un-handled — and if it was already critical
 *          the value-growth test below still gates re-surfacing), OR
 *        - its |value_numeric| has grown past `baseline_value_at_override` in the
 *          worsening direction by at least RESURFACE_VALUE_GROWTH_FRACTION.
 *        Otherwise stays suppressed.
 *  4. Override row exists but neither snooze nor dismiss is active → NOT
 *     suppressed (e.g. a cleared override).
 */
export function isSuppressed(
  item: SuppressionItem,
  override: SuppressionOverride | null,
  now: Date,
): boolean {
  if (!override) return false;

  // Snooze takes precedence while it is still in effect.
  if (override.snoozed_until && override.snoozed_until.getTime() > now.getTime()) {
    return true;
  }

  if (override.dismissed_at) {
    if (!override.resurface_on_new_signal) return true;
    return !hasWorsenedSinceDismiss(item, override);
  }

  // No active snooze and not dismissed → nothing to suppress.
  return false;
}

/**
 * Has the live signal worsened enough since the coach dismissed it to warrant
 * resurfacing? Signal-aware via two complementary tests (OR):
 *   - tier escalation to `critical`
 *   - magnitude growth past the captured baseline in the worsening direction
 */
function hasWorsenedSinceDismiss(
  item: SuppressionItem,
  override: SuppressionOverride,
): boolean {
  // Tier escalation: now critical is always a fresh escalation worth surfacing.
  if (item.severity === 'critical') return true;

  const baseline = override.baseline_value_at_override;
  const current = item.value_numeric;
  if (baseline == null || current == null) return false;

  // Worsening direction is the growth of magnitude away from zero: a signal can
  // worsen by going more negative (HRV delta) or more positive (RPE, days). We
  // compare absolute magnitudes so the rule is direction-agnostic.
  const baselineMag = Math.abs(baseline);
  const currentMag = Math.abs(current);
  if (baselineMag === 0) {
    // No magnitude to grow from — any non-zero current counts as worsening.
    return currentMag > 0;
  }
  const growth = (currentMag - baselineMag) / baselineMag;
  return growth >= RESURFACE_VALUE_GROWTH_FRACTION;
}

/** Re-exported so callers can reason over the same rank without re-importing. */
export { SIGNAL_SEVERITY_RANK };
