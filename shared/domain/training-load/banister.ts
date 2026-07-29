// Banister impulse-response model for chronic/acute training load.
//
//   CTL[t] = CTL[t-1] + (TSS[t] - CTL[t-1]) / τ_c     (τ_c = 42 days)
//   ATL[t] = ATL[t-1] + (TSS[t] - ATL[t-1]) / τ_a     (τ_a = 7 days)
//   TSB[t] = CTL[t-1] - ATL[t-1]                       (yesterday's freshness)
//
// We expose a pure function over a daily-TSS series so it's trivial to test
// and to recompute on demand from workout_executions.

export const CTL_DECAY_DAYS = 42;
export const ATL_DECAY_DAYS = 7;

export type DailyTss = {
  date: string;        // YYYY-MM-DD, ascending
  /** Load from the day's sessions whose intensity WAS known (see tss.ts). */
  tss: number;
  /**
   * Executed seconds that day priced into `tss`. Set by the DB reader
   * (`getDailyTssSeries`); absent when a caller supplies a bare TSS series
   * (tests, synthetic scenarios) and the Banister math alone is wanted.
   */
  known_seconds?: number;
  /**
   * Executed seconds that day whose intensity nobody measured or declared, and
   * which are therefore NOT in `tss`. Carried — not dropped, not defaulted — so
   * the aggregate can say "esta parte de la carga no se conoce" instead of
   * hiding the hole behind an invented intensity (docs/CONTRATO-UI.md §7).
   */
  unknown_seconds?: number;
  /**
   * How many of that day's sessions those `unknown_seconds` came from. Seconds
   * size the hole in the curve; SESSIONS are what the coach can act on — "pídele
   * el RPE de 2 sesiones" is a request, "de 47 minutos" is not. Both are needed,
   * so both are carried.
   */
  unknown_sessions?: number;
};

export type LoadPoint = {
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;         // CTL_prev - ATL_prev
};

export function computeLoadSeries(
  daily: ReadonlyArray<DailyTss>,
  options?: { ctl_seed?: number; atl_seed?: number; ctl_tau?: number; atl_tau?: number },
): LoadPoint[] {
  const ctlTau = options?.ctl_tau ?? CTL_DECAY_DAYS;
  const atlTau = options?.atl_tau ?? ATL_DECAY_DAYS;
  let ctl = options?.ctl_seed ?? 0;
  let atl = options?.atl_seed ?? 0;
  const out: LoadPoint[] = [];
  for (const point of daily) {
    const tsb = ctl - atl;
    ctl = ctl + (point.tss - ctl) / ctlTau;
    atl = atl + (point.tss - atl) / atlTau;
    out.push({ date: point.date, tss: point.tss, ctl, atl, tsb });
  }
  return out;
}

export type LoadSummary = {
  ctl: number;          // fitness — 42d EWMA
  atl: number;          // fatigue — 7d EWMA
  tsb: number;          // freshness — CTL - ATL
  /**
   * Acute:chronic ratio over last 7d / last 28d. NULL when the chronic window
   * carries no load at all: that ratio is 0/0 — undefined, not zero. A measured
   * 0 (trained for 28 d, then stopped for 7) is a real reading and stays 0.
   */
  acr: number | null;
  last_7d_tss: number;
  last_28d_tss: number;
  /** Executed seconds in the chronic (28 d) window that ARE priced into the numbers above. */
  known_seconds_28d: number;
  /**
   * Executed seconds in the same window with no power, no HR and no RPE — real
   * training the numbers above do NOT include. A consumer that reports load must
   * be able to declare this hole rather than present a partial reading as whole.
   */
  unknown_seconds_28d: number;
  /** How many sessions those unpriced seconds came from — the actionable unit. */
  unknown_sessions_28d: number;
};

/**
 * Share 0…1 of the chronic window's executed work whose intensity was known —
 * i.e. how much of the athlete's training the CTL/ATL/TSB/ACR numbers actually
 * saw. Null when nothing was executed in the window (no work ⇒ no coverage to
 * report, which is not the same as 0 % coverage).
 *
 * Consumers that PRESENT load to a human want `readLoadCoverage` (./coverage)
 * instead: it turns this share into the state, the verdict gate and the wording
 * the screens must agree on. This bare ratio stays for callers doing their own
 * thresholding against `LOAD_COVERAGE_MIN`.
 */
export function loadIntensityCoverage(summary: LoadSummary): number | null {
  const total = summary.known_seconds_28d + summary.unknown_seconds_28d;
  if (total <= 0) return null;
  return summary.known_seconds_28d / total;
}

/** Executed seconds in the chronic window, priced or not — the athlete's real volume. */
export function executedSeconds28d(summary: LoadSummary): number {
  return summary.known_seconds_28d + summary.unknown_seconds_28d;
}

// ACR per Gabbett et al. — last-7d sum divided by mean of last-28d daily load.
// `daily` is ascending; we read from the tail.
//
// The ratio is NULL when the chronic window is empty, and that distinction is the
// whole point: 0/0 is undefined, and an ACR reported as 0 gets labelled "bajo" —
// a training verdict pronounced over an athlete nobody has measured. A chronic
// window WITH load and an empty acute week is a different sentence entirely (he
// trained, then stopped), it returns a real 0, and it earns its "bajo".
export function computeAcr(daily: ReadonlyArray<DailyTss>): {
  acr: number | null;
  last_7d_tss: number;
  last_28d_tss: number;
} {
  if (daily.length === 0) {
    return { acr: null, last_7d_tss: 0, last_28d_tss: 0 };
  }
  const tail7 = daily.slice(-7);
  const tail28 = daily.slice(-28);
  const sum7 = tail7.reduce((s, d) => s + d.tss, 0);
  const sum28 = tail28.reduce((s, d) => s + d.tss, 0);
  const mean28 = tail28.length > 0 ? sum28 / tail28.length : 0;
  // weekly equivalent of the chronic mean
  const chronic_weekly = mean28 * 7;
  const acr = chronic_weekly > 0 ? sum7 / chronic_weekly : null;
  return { acr, last_7d_tss: sum7, last_28d_tss: sum28 };
}

export function summarizeLoad(daily: ReadonlyArray<DailyTss>): LoadSummary {
  const series = computeLoadSeries(daily);
  const last = series[series.length - 1];
  const ctl = last?.ctl ?? 0;
  const atl = last?.atl ?? 0;
  const tsb = ctl - atl;
  const { acr, last_7d_tss, last_28d_tss } = computeAcr(daily);
  const tail28 = daily.slice(-28);
  const known_seconds_28d = tail28.reduce((s, d) => s + (d.known_seconds ?? 0), 0);
  const unknown_seconds_28d = tail28.reduce((s, d) => s + (d.unknown_seconds ?? 0), 0);
  const unknown_sessions_28d = tail28.reduce((s, d) => s + (d.unknown_sessions ?? 0), 0);
  return {
    ctl,
    atl,
    tsb,
    acr,
    last_7d_tss,
    last_28d_tss,
    known_seconds_28d,
    unknown_seconds_28d,
    unknown_sessions_28d,
  };
}
