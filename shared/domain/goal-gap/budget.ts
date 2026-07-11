// @fahybrid/shared/domain/goal-gap — the per-segment BUDGET (pure, no I/O).
//
// A budget decomposes the GOAL time into the 10 segments by the FRACTION each
// segment typically takes of a comparable race:
//   · 'cohorte'    — the mean fraction across ≥ MIN_COHORT_RACES real singles
//                    races near the goal (division+gender, else relaxed to
//                    singles-only). Anonymous aggregate, never one athlete.
//   · 'tu_carrera' — the athlete's own latest complete singles race, scaled.
// The budget ALWAYS closes: the 10 integer seconds sum EXACTLY to the goal
// (largest-remainder apportionment fixes the rounding residue). Never goal÷10,
// never an invented external distribution.

import { MIN_COHORT_RACES, type BudgetSource, type CohortRace, type OwnRace, type SegmentDef } from './types';

/**
 * The per-segment fraction of the race for one complete race. Normalized by the
 * SUM of the 10 segments (not result_s): the budget decomposes the goal by the
 * segments' own proportions, so the fractions always sum to exactly 1 and the
 * budget always closes — even when a race's stored total drifts from its splits.
 * Order follows `segments`; a station reads its split by station_index.
 */
function raceFractions(
  segments: SegmentDef[],
  race: { run_total_s: number; station_s: Record<number, number>; roxzone_s: number },
): number[] {
  const raw = segments.map((seg) => {
    if (seg.kind === 'run') return Math.max(0, race.run_total_s);
    if (seg.kind === 'roxzone') return Math.max(0, race.roxzone_s);
    const split = seg.station_index != null ? race.station_s[seg.station_index] : undefined;
    return split != null && split > 0 ? split : 0;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return raw.map(() => 0);
  return raw.map((v) => v / sum);
}

/**
 * Apportion `total` across `fractions` into integers that sum EXACTLY to `total`.
 * Largest-remainder: floor each share, then hand the leftover seconds one by one
 * to the segments with the biggest fractional part. Deterministic (ties break by
 * order), so the same input always yields the same budget. Robust to fractions
 * that don't sum to 1 (residue is distributed round-robin over the ranking).
 */
export function largestRemainder(fractions: number[], total: number): number[] {
  const raw = fractions.map((f) => f * total);
  const out = raw.map((r) => Math.floor(r));
  const residue = total - out.reduce((a, b) => a + b, 0);
  if (residue === 0 || out.length === 0) return out;
  // Rank by descending fractional part; give +1 round-robin down the ranking for
  // a positive residue, −1 up the ranking for a (rare) negative one.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const step = residue > 0 ? 1 : -1;
  for (let k = 0; k < Math.abs(residue); k++) {
    const idx = step > 0 ? order[k % order.length]!.i : order[order.length - 1 - (k % order.length)]!.i;
    out[idx] = (out[idx] ?? 0) + step;
  }
  return out;
}

export interface BudgetOutcome {
  source: BudgetSource;
  /** Integer seconds per segment (order follows `segments`), summing to the goal. */
  budgets: number[];
}

/**
 * Build the budget for `goal`, cohort first, own race second, else null.
 *   · cohort ≥ MIN_COHORT_RACES → mean of each race's segment fractions (each
 *     race sums to 1, so the mean sums to 1) × goal.
 *   · else own COMPLETE race → its own fractions × goal.
 *   · else null (the caller gates 'no_data').
 */
export function computeBudget(
  goal: number,
  segments: SegmentDef[],
  cohort: CohortRace[],
  ownRace: OwnRace | null,
): BudgetOutcome | null {
  if (goal <= 0) return null;

  if (cohort.length >= MIN_COHORT_RACES) {
    const per = cohort.map((r) => raceFractions(segments, r));
    const mean = segments.map((_, i) => per.reduce((a, r) => a + (r[i] ?? 0), 0) / per.length);
    return { source: 'cohorte', budgets: largestRemainder(mean, goal) };
  }

  if (
    ownRace &&
    ownRace.complete &&
    ownRace.result_s != null &&
    ownRace.result_s > 0 &&
    ownRace.run_total_s != null &&
    ownRace.roxzone_s != null
  ) {
    // A complete own race carries every station split; coerce to the CohortRace
    // shape (all present) so raceFractions reads them uniformly.
    const stations: Record<number, number> = {};
    for (const [k, v] of Object.entries(ownRace.station_s)) {
      if (v != null && v > 0) stations[Number(k)] = v;
    }
    const fractions = raceFractions(segments, {
      run_total_s: ownRace.run_total_s,
      station_s: stations,
      roxzone_s: ownRace.roxzone_s,
    });
    return { source: 'tu_carrera', budgets: largestRemainder(fractions, goal) };
  }

  return null;
}
