// RACE READINESS — the coach-grade 0…100 composite shown on the roster and on
// the athlete's own page. Coach-grade rather than research-grade on purpose: it
// is a triage number, not a physiological claim.
//
// It lives here because it was written TWICE (roster and deep-dive) and the two
// copies had already drifted apart: one returned null when there was no signal,
// the other always returned a number and let a missing TSB fall through as 0,
// which is 20 of the 40 freshness points handed to an athlete nobody measured.
// The same athlete could therefore read differently on the two screens. Having
// two formulas is what produced every divergence this codebase has had to undo.

import type { LoadCoverage } from '../training-load/coverage';

/** Point budget — the four bands add up to 100. */
const FRESHNESS_MAX = 40;
const COMPLIANCE_MAX = 30;
const HRV_MAX = 20;
const ACTIVITY_MAX = 10;

/** TSB range mapped across the freshness band: −10 scores 0, +10 scores full. */
const TSB_FLOOR = -10;
const TSB_CEILING = 10;

/** Neutral credit when a signal is absent but the score still stands. */
const COMPLIANCE_UNKNOWN_PTS = 20;
const HRV_UNKNOWN_PTS = 10;

/** Each active day is worth this much, so the band saturates at ~7 days. */
const ACTIVITY_PTS_PER_DAY = 1.5;

export type RaceReadinessInput = {
  /** Freshness (CTL − ATL). Null when there is no load reading to speak of. */
  tsb: number | null;
  /** 0…100 adherence over the last 7 days; null when nothing was scheduled. */
  compliance_pct: number | null;
  /** HRV vs baseline, ms. Null when there is no baseline. */
  hrv_delta_ms: number | null;
  /** Days with executed work in the last 7 (saturates the band at ≥ 7). */
  active_days_7d: number;
  /** How much of the executed work the TSB above actually saw. */
  load_coverage: LoadCoverage;
};

/**
 * Null means "not scoreable", never "zero readiness". Three ways to get there:
 *
 *  • No signal at all — nothing executed, no HRV, no adherence. We do NOT invent
 *    a ~50 baseline for a data-less athlete.
 *  • No TSB. Freshness is 40 of the 100 points; without it there is no score,
 *    and a missing TSB must not quietly collect the mid-band.
 *  • A load reading with a hole in it. TSB is undecidable in BOTH directions
 *    under partial coverage (shared/domain/training-load/coverage.ts), so the
 *    composite would be uncertain by up to 40 points — which is not a score.
 *    Callers carry the coverage alongside, so the screen can say why.
 */
export function estimateRaceReadiness(input: RaceReadinessInput): number | null {
  if (input.active_days_7d === 0 && input.hrv_delta_ms == null && input.compliance_pct == null) {
    return null;
  }
  if (input.tsb == null) return null;
  if (!input.load_coverage.allows_verdict) return null;

  const span = TSB_CEILING - TSB_FLOOR;
  const freshness = clamp(((input.tsb - TSB_FLOOR) / span) * FRESHNESS_MAX, 0, FRESHNESS_MAX);
  const compliance =
    input.compliance_pct != null
      ? (input.compliance_pct / 100) * COMPLIANCE_MAX
      : COMPLIANCE_UNKNOWN_PTS;
  const hrv =
    input.hrv_delta_ms == null
      ? HRV_UNKNOWN_PTS
      : clamp(HRV_UNKNOWN_PTS + input.hrv_delta_ms, 0, HRV_MAX);
  const activity = Math.min(ACTIVITY_MAX, input.active_days_7d * ACTIVITY_PTS_PER_DAY);

  return Math.round(freshness + compliance + hrv + activity);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
