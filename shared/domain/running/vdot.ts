// Jack Daniels VDOT — self-contained running fitness model from one race time.
//
// WHAT IT DOES
// ------------
// Given a single distance/time effort (we feed it the athlete's stored `run_5k`
// benchmark), it computes:
//   • vdot          — Daniels' VDOT index (a VO₂max-equivalent fitness number)
//   • trainingPaces — the four canonical Daniels paces (Easy, Marathon,
//                     Threshold, Interval) in seconds per km
//
// WHY A SEPARATE MODULE (not the zone resolver)
// ---------------------------------------------
// The zone resolver in domain/methodology/zones.ts maps a coach LABEL ("Z4 row",
// "race pace") onto a per-athlete prescription Target using the full benchmark
// set. This is a different, narrower job: turn ONE race time into a physiological
// fitness estimate + canonical training paces. It depends on nothing but that one
// number, duplicates none of the resolver's anchors/fallbacks, and is the honest
// minimum the running deep-dive needs for threshold / VO₂ / pace-zone tiles.
//
// The formulas are Daniels & Gilbert's published equations (Daniels' Running
// Formula), the de-facto market standard — the same math VDOT calculators use.
// No external data, no DB, no I/O: pure functions, deterministic, unit-testable.

/** A single race effort used to seed the model. */
export interface RaceEffort {
  /** Distance covered, in metres. */
  distance_meters: number;
  /** Time taken, in seconds. */
  duration_seconds: number;
}

/** Canonical Daniels training paces, all in seconds per kilometre. */
export interface DanielsTrainingPaces {
  /** Easy / recovery (≈ Z2). */
  easy_s_per_km: number;
  /** Marathon pace (≈ upper Z3). */
  marathon_s_per_km: number;
  /** Threshold / tempo (≈ Z4, the lactate-threshold pace). */
  threshold_s_per_km: number;
  /** Interval / VO₂max (≈ Z5). */
  interval_s_per_km: number;
}

export interface VdotResult {
  /** The VDOT fitness index (≈ VO₂max in ml/kg/min). */
  vdot: number;
  /** Training paces derived from the VDOT (seconds per km). */
  paces: DanielsTrainingPaces;
}

// ── Daniels & Gilbert equations ─────────────────────────────────────────────
//
// 1) Oxygen cost of running at velocity v (metres/min):
//      VO2 = -4.60 + 0.182258·v + 0.000104·v²
// 2) Fraction of VO₂max sustainable for a race lasting t minutes:
//      %max = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)
//    VDOT = VO2(v) / %max(t).

const VO2_C0 = -4.6;
const VO2_C1 = 0.182258;
const VO2_C2 = 0.000104;

const PCT_BASE = 0.8;
const PCT_A1 = 0.1894393;
const PCT_K1 = -0.012778;
const PCT_A2 = 0.2989558;
const PCT_K2 = -0.1932605;

/** Oxygen cost (ml/kg/min) of running at velocity v (m/min). */
function vo2AtVelocity(vMetresPerMin: number): number {
  return VO2_C0 + VO2_C1 * vMetresPerMin + VO2_C2 * vMetresPerMin * vMetresPerMin;
}

/** Fraction of VO₂max sustainable for an effort of t minutes. */
function pctVo2maxForDuration(tMinutes: number): number {
  return PCT_BASE + PCT_A1 * Math.exp(PCT_K1 * tMinutes) + PCT_A2 * Math.exp(PCT_K2 * tMinutes);
}

/**
 * Invert the VO₂ cost quadratic: given a target VO₂ demand, return the velocity
 * (m/min) that produces it. Solves 0.000104·v² + 0.182258·v + (−4.6 − VO2) = 0
 * for the positive root.
 */
function velocityForVo2(targetVo2: number): number {
  const a = VO2_C2;
  const b = VO2_C1;
  const c = VO2_C0 - targetVo2;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return 0;
  return (-b + Math.sqrt(disc)) / (2 * a);
}

/** Convert a velocity in m/min to a pace in seconds per km. */
function velocityToSecPerKm(vMetresPerMin: number): number {
  if (vMetresPerMin <= 0) return 0;
  // 1000 m at v m/min takes (1000 / v) min → ×60 for seconds.
  return (1000 / vMetresPerMin) * 60;
}

// %VDOT each canonical pace is run at (Daniels' Running Formula intensity
// anchors). These are the midpoints of Daniels' published ranges, the values
// VDOT calculators use for a single representative pace per zone.
const PCT_EASY = 0.7; // E: 59–74% → ~70%
const PCT_MARATHON = 0.84; // M: ~84%
const PCT_THRESHOLD = 0.88; // T: ~88% (lactate threshold)
const PCT_INTERVAL = 0.98; // I: ~95–100% → ~98%

// Plausibility bounds. A VDOT outside this range almost certainly means a
// malformed/garbage benchmark (e.g. a 5K logged as 5 minutes), so we reject it
// rather than emit an absurd pace. 30 ≈ very beginner; 85 ≈ world-class.
const VDOT_MIN = 25;
const VDOT_MAX = 90;

/**
 * Compute VDOT + canonical training paces from a single race effort.
 * Returns null when the effort is missing/implausible (so callers emit honest
 * nulls rather than fabricated paces).
 */
export function computeVdot(effort: RaceEffort | null | undefined): VdotResult | null {
  if (!effort) return null;
  const { distance_meters, duration_seconds } = effort;
  if (
    !Number.isFinite(distance_meters) ||
    !Number.isFinite(duration_seconds) ||
    distance_meters <= 0 ||
    duration_seconds <= 0
  ) {
    return null;
  }

  const velocity = distance_meters / (duration_seconds / 60); // m/min
  const tMinutes = duration_seconds / 60;

  const vo2Demand = vo2AtVelocity(velocity);
  const pct = pctVo2maxForDuration(tMinutes);
  if (pct <= 0) return null;

  const vdot = vo2Demand / pct;
  if (!Number.isFinite(vdot) || vdot < VDOT_MIN || vdot > VDOT_MAX) return null;

  const paceAtPct = (fraction: number): number =>
    Math.round(velocityToSecPerKm(velocityForVo2(vdot * fraction)));

  return {
    vdot: Math.round(vdot * 10) / 10,
    paces: {
      easy_s_per_km: paceAtPct(PCT_EASY),
      marathon_s_per_km: paceAtPct(PCT_MARATHON),
      threshold_s_per_km: paceAtPct(PCT_THRESHOLD),
      interval_s_per_km: paceAtPct(PCT_INTERVAL),
    },
  };
}

/** The standard 5K distance in metres — the benchmark this model is fed. */
export const RUN_5K_METERS = 5000;
