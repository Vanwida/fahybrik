// Running best-effort BANDS + the pure PR (personal-record) decision.
//
// WHY THIS EXISTS (and why it's shared)
// -------------------------------------
// The athlete analytics section (web `lib/athlete/analytics/running.ts`
// ::buildBestEfforts) already computes best 1k / 3k efforts from run
// `segment_executions`, but with those band constants PRIVATE to that file and
// the SQL welded to a DB client — so the "did THIS session set a record?" check
// at workout-close cannot reuse it as a pure function. This module is the honest
// home for the two REUSABLE pieces:
//   1. RUN_PR_BANDS — the distance eligibility windows + how each is measured,
//      as a single source of truth both the close-PR SQL and (later) the
//      analytics card can key off, instead of duplicating 800/1200/2700/3300.
//   2. detectRunningPRs — a pure comparison of a session's efforts against the
//      athlete's prior bests. No DB, no I/O: deterministic + unit-testable.
//
// MEASUREMENT MODEL (matches analytics for 1k/3k; extends it to 5k)
// -----------------------------------------------------------------
// Every value is SECONDS and LOWER IS BETTER for all three distances:
//   • run_1k — a single ~1 km run SEGMENT, value = pace in s/km (a segment that
//              is not exactly 1 km is extrapolated to 1 km, exactly as the
//              analytics card does). Per-SEGMENT.
//   • run_3k — a run EXECUTION whose total run distance is ~3 km, value = total
//              run TIME in seconds. Per-EXECUTION.
//   • run_5k — same shape as 3k at ~5 km. Per-EXECUTION.
// A "PR" is emitted only when the session actually CONTAINS an eligible effort
// (honesty) AND either the athlete has no prior mark for that distance (first
// mark → prev null) or the session strictly beats the prior best (faster).
//
// COHERENCE NOTE — 5k here is SEGMENTS, the analytics 5k card is a TEST (follow-up owned)
// -------------------------------------------------------------------------------------
// `run_5k` here is the athlete's fastest 5 km actually RUN (from segments) — what
// an athlete means by "mi 5k más rápido". It DIFFERS from the analytics best-5k
// card (`running.ts::buildBestEfforts`), which shows the latest run_5k *test*
// benchmark (a calibration number, a different concept). best_1k / best_3k DO
// agree (both segment-based); only 5k diverges today. Two consequences:
//   (a) COPY: any surface rendering a run_5k PR must be unambiguous that it is the
//       fastest 5 km RUN ("tu 5 km más rápido corrido"), never "tu test de 5k".
//   (b) FOLLOW-UP (owned by team-lead, not this module): running.ts will show the
//       best 5 km CORRIDO from segments, with the test 5k as a separate line — so
//       the two 5k numbers stop reading as a contradiction. Until then the
//       divergence is intentional and documented, not silent.

// Riegel's endurance model — the SAME function the mark projections already use,
// imported rather than restated so a 4 600 m run cannot become two different
// 5 km estimates in two modules.
import { riegelTime } from '../athlete/mark-projection';

export const RUN_PR_KINDS = ['run_1k', 'run_3k', 'run_5k'] as const;
export type RunPrKind = (typeof RUN_PR_KINDS)[number];

/** How a distance's best effort is measured from run segments. */
export type RunPrAggregation = 'segment' | 'execution';

export interface RunPrBand {
  /** Inclusive lower bound of the eligible distance window, metres. */
  min_meters: number;
  /** Inclusive upper bound of the eligible distance window, metres. */
  max_meters: number;
  /** `segment`: a single run segment in-band. `execution`: the execution's total run in-band. */
  aggregation: RunPrAggregation;
}

/**
 * Distance eligibility windows. 1k/3k are the SAME windows the analytics card
 * uses (±20% around 1 km, ±10% around 3 km). 5k follows the 3 km rule (±10%).
 */
export const RUN_PR_BANDS: Record<RunPrKind, RunPrBand> = {
  run_1k: { min_meters: 800, max_meters: 1200, aggregation: 'segment' },
  run_3k: { min_meters: 2700, max_meters: 3300, aggregation: 'execution' },
  run_5k: { min_meters: 4500, max_meters: 5500, aggregation: 'execution' },
};

/**
 * A set of best-effort values (seconds) keyed by distance. A `null` means the
 * scope had NO eligible effort at that distance — for a session it means the
 * session didn't contain that distance; for the prior it means the athlete has
 * never recorded one.
 */
export type RunningEffortSet = Record<RunPrKind, number | null>;

/** One personal record broken (or set for the first time) by a session. */
export interface RunningPR {
  kind: RunPrKind;
  /** The session's value for the distance, seconds (lower = better). */
  new_value_s: number;
  /** The prior best for the distance, seconds; null if this is the first mark. */
  prev_value_s: number | null;
}

/**
 * Pure PR decision: for each distance, emit a record when the session has an
 * eligible effort that is either the athlete's FIRST (prev null) or strictly
 * FASTER than their prior best. Deterministic, no I/O.
 */
export function detectRunningPRs(session: RunningEffortSet, prior: RunningEffortSet): RunningPR[] {
  const prs: RunningPR[] = [];
  for (const kind of RUN_PR_KINDS) {
    const value = session[kind];
    // Not eligible this session → never a PR (honesty: no effort, no record).
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    const prev = prior[kind];
    const prevValid = prev != null && Number.isFinite(prev) && prev > 0 ? prev : null;
    // First-ever mark, or a strict improvement (faster). A tie is NOT a PR.
    if (prevValid == null || value < prevValid) {
      prs.push({ kind, new_value_s: value, prev_value_s: prevValid });
    }
  }
  return prs;
}

// ---------------------------------------------------------------------------
// THE BEST-EFFORT CURVE — the same fact, read across the whole distance ladder
// ---------------------------------------------------------------------------
//
// WHY IT LIVES HERE. The athlete's "¿estoy mejorando?" screen draws a CURVE of
// best efforts from 400 m to 10 km, with the previous month behind it as a
// shadow. Three loose records cannot draw a curve. But the hard question the
// curve asks is the one this module already answers — "what distance window
// counts as a 1 km effort?" — so the ladder belongs next to `RUN_PR_BANDS`
// rather than in a second table that could drift from it.
//
// PR detection keeps its three slugs (they are `athlete_benchmarks` rows and a
// record is a different claim from a curve point). What is shared, and shared
// ONCE, is the distance windows.

/** The distance ladder the curve is drawn on, ascending. */
export const EFFORT_CURVE_METERS = [400, 800, 1000, 1600, 3000, 5000, 10000] as const;
export type EffortCurveMeters = (typeof EFFORT_CURVE_METERS)[number];

/**
 * The window + measurement scope for every rung.
 *
 * 1 km / 3 km / 5 km REUSE `RUN_PR_BANDS` verbatim — not a copy of its numbers.
 * If the curve narrowed 1 km to ±10 % while PR detection kept ±20 %, the same
 * run would be "your best kilometre" on one screen and not exist on the other.
 * The four new rungs follow the ±10 % rule (the majority rule of the existing
 * three), and the short ones are measured per SEGMENT while 10 km is measured
 * per EXECUTION — same split, same reason: a 400 m best is one rep, a 10 km
 * best is a whole run.
 */
export const EFFORT_CURVE_BANDS: Record<EffortCurveMeters, RunPrBand> = {
  400: { min_meters: 360, max_meters: 440, aggregation: 'segment' },
  800: { min_meters: 720, max_meters: 880, aggregation: 'segment' },
  1000: RUN_PR_BANDS.run_1k,
  1600: { min_meters: 1440, max_meters: 1760, aggregation: 'segment' },
  3000: RUN_PR_BANDS.run_3k,
  5000: RUN_PR_BANDS.run_5k,
  10000: { min_meters: 9000, max_meters: 11000, aggregation: 'execution' },
};

/** One measured effort offered to the curve. `scope` says what it is: a single
 *  segment, or a whole execution's run total. A rung only looks at candidates
 *  whose scope matches its band. */
export interface EffortCandidate {
  distance_m: number;
  duration_s: number;
  scope: RunPrAggregation;
}

/** A point of the curve: the best TIME at a canonical distance. */
export interface CurveEffort {
  metros: number;
  segundos: number;
}

/**
 * The athlete's best effort at each rung, from whatever they actually ran.
 *
 * NORMALISED WITH RIEGEL, not linearly. A run inside the window is rarely the
 * exact distance, so it has to be projected onto it. Scaling a 4 600 m run to
 * 5 km linearly assumes an athlete holds the same pace however far they go,
 * which is exactly the thing that is not true — and the error grows with the
 * rung, which is worst precisely at the long end where the curve is flattest
 * and most readable. Riegel is the standard correction and is already in the
 * codebase.
 *
 * A rung with no eligible effort is ABSENT from the result — never a zero and
 * never an interpolation between its neighbours. A gap in the curve is a real
 * statement: he has not raced that distance.
 */
export function buildEffortCurve(candidates: readonly EffortCandidate[]): CurveEffort[] {
  const best = new Map<number, number>();

  for (const c of candidates) {
    if (!Number.isFinite(c.distance_m) || c.distance_m <= 0) continue;
    if (!Number.isFinite(c.duration_s) || c.duration_s <= 0) continue;

    for (const metros of EFFORT_CURVE_METERS) {
      const band = EFFORT_CURVE_BANDS[metros];
      if (band.aggregation !== c.scope) continue;
      if (c.distance_m < band.min_meters || c.distance_m > band.max_meters) continue;

      const proyectado = riegelTime(c.duration_s, c.distance_m, metros);
      if (!Number.isFinite(proyectado) || proyectado <= 0) continue;

      const previo = best.get(metros);
      if (previo == null || proyectado < previo) best.set(metros, proyectado);
    }
  }

  return EFFORT_CURVE_METERS.filter((m) => best.has(m)).map((metros) => ({
    metros,
    segundos: Math.round(best.get(metros)!),
  }));
}
