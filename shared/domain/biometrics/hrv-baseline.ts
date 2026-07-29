// HRV vs BASELINE — how suppressed an athlete's variability is right now.
//
// One rule, one set of windows. The comparison is written as inline SQL in three
// separate places today (the roster batch query, the athlete ficha, the IA
// context), which is exactly how a metric ends up meaning three things; this file
// is where the fourth copy did NOT get written.
//
// THE WINDOWS, and why they are not symmetric:
//
//   recent   = the last 7 days
//   baseline = 60 → 14 days ago
//
// The baseline STOPS 14 days short of today on purpose: include the recent
// fortnight and an acute dip drags down the very reference it is being measured
// against, so a genuinely suppressed athlete reads "normal". The 14-day gap is
// what makes the delta able to detect anything at all.
//
// NULL when either side is empty. An athlete with three days of data has no
// baseline, and "no baseline" is not "delta 0" — a zero delta says "exactly as
// usual", which is a measurement nobody took.

/** One raw variability reading. Raw, not a daily mean: the windows are instants. */
export type HrvSample = {
  /** When it was recorded. */
  at: Date;
  /** Milliseconds. */
  value: number;
};

/** Trailing window taken as "now". */
export const HRV_RECENT_DAYS = 7;
/** Baseline window opens this many days back… */
export const HRV_BASELINE_FROM_DAYS = 60;
/** …and closes this many days back, leaving the acute fortnight out of it. */
export const HRV_BASELINE_TO_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Mean of the samples inside `[from, to)`. Null when the window is empty — the
 * caller must not turn that into a zero.
 */
export function meanOverWindow(
  samples: ReadonlyArray<HrvSample>,
  from: Date,
  to: Date,
): number | null {
  let sum = 0;
  let n = 0;
  const lo = from.getTime();
  const hi = to.getTime();
  for (const s of samples) {
    const t = s.at.getTime();
    if (t >= lo && t < hi) {
      sum += s.value;
      n += 1;
    }
  }
  return n > 0 ? sum / n : null;
}

/**
 * Recent mean minus baseline mean, in ms. Negative = suppressed.
 *
 * Null when either window is empty. Deliberately unrounded: the composite that
 * consumes it scores in points, and rounding twice is how the roster and the
 * ficha came to show the same athlete a beat apart.
 */
export function hrvDeltaMs(samples: ReadonlyArray<HrvSample>, at: Date): number | null {
  const t = at.getTime();
  const recent = meanOverWindow(
    samples,
    new Date(t - HRV_RECENT_DAYS * MS_PER_DAY),
    // Exclusive upper bound one tick past `at`, so a sample recorded exactly at
    // `at` counts — the window is "up to and including now".
    new Date(t + 1),
  );
  if (recent == null) return null;

  const baseline = meanOverWindow(
    samples,
    new Date(t - HRV_BASELINE_FROM_DAYS * MS_PER_DAY),
    new Date(t - HRV_BASELINE_TO_DAYS * MS_PER_DAY),
  );
  if (baseline == null) return null;

  return recent - baseline;
}
