// Cohort-level polarization: the mean of the per-athlete zone distributions.
//
// ONE owner, because there were two — `briefing.ts` and `weekly-review.ts` each
// carried a byte-identical copy, and each carried the same fabrication: when no
// athlete had a distribution, a cohort of 5+ was handed `{78, 8, 14}` labelled
// "typical élite distribution". Nobody measured it. The coach read it as his
// cohort's own 7-day zone split and it drove a drift warning against the 80/0/20
// target.
//
// There is nothing to fall back TO: `polarization_pct` is null for every athlete
// the cohort builder emits, so the synthetic branch was not an edge case — it was
// the only branch that ever ran. The honest answer is null, and a null
// polarization means the line is not painted at all.
//
// EL OBJETIVO YA NO VIVE AQUÍ (10-ago-2026). El 80/0/20 estaba escrito dos veces
// —esta constante y otra igual con otro nombre en
// `web/lib/dashboard/coach/deep-dive-performance.ts`— y es MÉTODO del coach, no
// mecanismo nuestro. Ahora nace en `coach/hr-method.ts` como defecto editable y
// esto lo lee de ahí: una sola cifra, un solo sitio. Las lecturas de COHORTE
// (briefing y repaso semanal) miran a varios atletas de un mismo coach a la vez,
// así que usan el objetivo por defecto mientras no reciban el suyo resuelto.

import {
  DEFAULT_COACH_HR_METHOD,
  polarizationDriftFrom,
  polarizationTargetFrom,
  type PolarizationSplit,
} from './hr-method';

export type { PolarizationSplit };

/** The polarization the coach is steering toward: mostly easy, nothing in the
 *  middle. THE SYSTEM DEFAULT — a coach with his own row overrides it. */
export const TARGET_POLARIZATION: PolarizationSplit =
  polarizationTargetFrom(DEFAULT_COACH_HR_METHOD);

/**
 * Mean zone split across the athletes that HAVE one. Null when none does —
 * never a stand-in distribution.
 */
export function aggregatePolarization(
  cohort: ReadonlyArray<{ polarization_pct: PolarizationSplit | null }>,
): PolarizationSplit | null {
  const valid = cohort.filter(
    (r): r is { polarization_pct: PolarizationSplit } => r.polarization_pct != null,
  );
  if (valid.length === 0) return null;

  const sum = valid.reduce(
    (s, r) => ({
      low: s.low + r.polarization_pct.low,
      mid: s.mid + r.polarization_pct.mid,
      high: s.high + r.polarization_pct.high,
    }),
    { low: 0, mid: 0, high: 0 },
  );
  return {
    low: Math.round(sum.low / valid.length),
    mid: Math.round(sum.mid / valid.length),
    high: Math.round(sum.high / valid.length),
  };
}

/**
 * How far a split has drifted from the target, in percentage points.
 *
 * The MAXIMUM single-band deviation, which is what the cohort headline has
 * always meant here ("Z3 drifted +14"). The athlete's ficha reads the SUM
 * instead (`polarizationDriftFrom`) because it compares one athlete's weeks
 * against each other — two different questions, each with its own name.
 */
export function polarizationDrift(
  split: PolarizationSplit,
  target: PolarizationSplit = TARGET_POLARIZATION,
): number {
  return Math.max(
    Math.abs(split.low - target.low),
    Math.abs(split.mid - target.mid),
    Math.abs(split.high - target.high),
  );
}

export { polarizationDriftFrom };
