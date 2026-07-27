// Marcas → nivel entrenado (pure, no I/O).
//
// THE MISSING CABLE. «Probarme» has always written to `athlete_benchmarks`, and
// the race projection has never read it: the trained side came only from logged
// training. An athlete could time-trial a 1000 m on the SkiErg and watch their
// HYROX projection not move a second. This module is the conversion that closes
// that loop — a measured mark, re-expressed as what the athlete would sustain at
// the distance the RACE actually asks for.
//
// TWO CONVERSIONS, TWO PUBLISHED MODELS, ZERO INVENTED CONSTANTS
//
//   Running — Daniels & Gilbert (domain/running/vdot), already in this repo. A
//     mark of any distance becomes a VDOT, and the VDOT becomes the pace that
//     fitness sustains over the race's 8 km. This is why a 5 K or a Cooper
//     outranks a 1 km time trial without any hand-written ranking: the model
//     itself knows that eight kilometres are not run at 1 km pace.
//
//   Ergs — a Riegel endurance exponent. A 500 m time doubled is not a 1000 m
//     time; nobody holds a 500 m pace for twice the distance.
//
// WHAT IS DELIBERATELY REFUSED: marks whose provenance is `onboarding` (declared
// at signup, never a measurement — migration 0139 says so in as many words) or
// `unknown` (historic rows, demo seeds). Same rule as `is_synthetic` for races:
// a number nobody measured never becomes evidence.

import type { MeasuredCapacity } from '../evidence';
import { ERG_PACE_UNIT_METERS, ERG_RACE_SPLIT_METERS } from '../race-transfer/types';
import { paceForRaceDistance, vdotFromEffort, vdotFromWatchVo2max } from '../running/vdot';
import { markBySlug, type MarkSpec } from './marks';

// ── The distances the race asks for ──────────────────────────────────────────

/** The HYROX run: 8 × 1 km. The distance every running mark is re-expressed at. */
export const HYROX_RUN_TOTAL_METERS = 8000;

/**
 * RIEGEL ENDURANCE EXPONENT — t₂ = t₁ × (d₂/d₁)^k.
 *
 * ORIGIN: k = 1.06 is Peter Riegel's published exponent ("Athletic Records and
 * Human Endurance", American Scientist, 1981), the value every endurance
 * calculator uses for distance-to-distance time prediction.
 *
 * WHY IT IS ALSO RIGHT FOR AN ERGOMETER: Concept2's own guidance is that pace
 * slows by roughly five seconds per 500 m for each doubling of the distance. At
 * k = 1.06 a 1:45 500 m projects to 3:39 over 1000 m — a 1:49.4 pace, +4.4 s.
 * Across the paces this catalog admits (1:10–5:00 per 500 m) the exponent that
 * reproduces that rule of thumb lands between 1.06 and 1.08, so Riegel's
 * published value sits inside the band rather than being fitted to it.
 *
 * STATUS: published constant, not a guess. It stays until the predicho-vs-real
 * loop has enough paired erg splits to say otherwise (ley 5).
 */
export const RIEGEL_ENDURANCE_EXPONENT = 1.06;

/** Riegel: the time for `to_m` implied by covering `from_m` in `time_s`. */
export function riegelTime(time_s: number, from_m: number, to_m: number): number {
  return time_s * Math.pow(to_m / from_m, RIEGEL_ENDURANCE_EXPONENT);
}

// ── Provenance ───────────────────────────────────────────────────────────────

/** `athlete_benchmarks.source` values the projection accepts as a measurement. */
const MEASURED_SOURCES: readonly string[] = ['athlete_test', 'coach_test'];
/** Accepted, but self-reported after the fact rather than measured by the app. */
const REGISTERED_SOURCE = 'registered';

/** A benchmark row, reduced to what the projection needs. */
export interface MarkRow {
  /** `athlete_benchmarks.exercise_slug` — must be in the closed marks catalog. */
  slug: string;
  /** Stored value: seconds for a time trial, metres for the Cooper. */
  value: number;
  /** Whole days since it was recorded; null when undated. */
  age_days: number | null;
  /** `athlete_benchmarks.source`. */
  source: string;
  /** `athlete_benchmarks.run_context` — 'outdoor' | 'treadmill' | null. */
  run_context: string | null;
}

/**
 * One mark, converted into the segment's comparison basis (s/km for the run,
 * s/500 m for an erg). It IS the shared `MeasuredCapacity` — the cross consumes
 * that shape, so there is no second definition to drift.
 *
 * `weakened` covers a treadmill mark standing in for street running (the belt
 * helps, and this catalog already refuses to mix the two contexts) and a race the
 * athlete reported rather than the app measured.
 */
export type ProjectedMark = MeasuredCapacity;

/** Is this row a usable measurement at all? */
function usable(row: MarkRow, spec: MarkSpec | null): spec is MarkSpec {
  if (!spec) return false;
  if (!Number.isFinite(row.value) || row.value <= 0) return false;
  return MEASURED_SOURCES.includes(row.source) || row.source === REGISTERED_SOURCE;
}

/** A registered (self-reported) or treadmill mark costs one notch of confidence. */
function isWeakened(row: MarkRow, spec: MarkSpec): boolean {
  if (row.source === REGISTERED_SOURCE) return true;
  return spec.group === 'run' && row.run_context === 'treadmill';
}

/**
 * The effort a run mark represents: distance covered and time taken. The Cooper
 * inverts the usual pair — the clock is fixed at 12 minutes and the VALUE is the
 * distance.
 */
function runEffort(row: MarkRow, spec: MarkSpec): { distance_meters: number; duration_seconds: number } | null {
  if (spec.fixed_duration_s != null) {
    return { distance_meters: row.value, duration_seconds: spec.fixed_duration_s };
  }
  if (spec.target_distance_m != null) {
    return { distance_meters: spec.target_distance_m, duration_seconds: row.value };
  }
  return null;
}

/**
 * How far a mark has to be stretched to reach the target distance, as |ln(ratio)|
 * — symmetric, so overshooting by a factor of two costs the same as falling short
 * by one. It is the ranking key: the LEAST extrapolated mark is the most
 * trustworthy, which is exactly why a 10 K or a 5 K beats a 1 km sprint.
 */
function extrapolationCost(from_m: number, to_m: number): number {
  return Math.abs(Math.log(from_m / to_m));
}

/** Candidate ordering: least stretched, then street over belt, then measured over
 *  reported, then freshest. Deterministic — no ties left to array order. */
function betterCandidate<T extends { stretch: number; weakened: boolean; age_days: number | null; outdoor: boolean }>(
  a: T,
  b: T,
): T {
  if (a.stretch !== b.stretch) return a.stretch < b.stretch ? a : b;
  if (a.outdoor !== b.outdoor) return a.outdoor ? a : b;
  if (a.weakened !== b.weakened) return a.weakened ? b : a;
  const aAge = a.age_days ?? Number.POSITIVE_INFINITY;
  const bAge = b.age_days ?? Number.POSITIVE_INFINITY;
  return aAge <= bAge ? a : b;
}

// ── Running ──────────────────────────────────────────────────────────────────

/**
 * The athlete's running level for the race's 8 km, from their best-suited mark.
 *
 * Every running mark in the catalog is admissible — 1 km, Cooper, 5 K, and the
 * registered 10 K / half / marathon — because Daniels converts all of them onto
 * the same scale. The one that wins is the one that needs the least stretching.
 */
export function projectRunMark(rows: readonly MarkRow[]): ProjectedMark | null {
  let best: {
    stretch: number;
    weakened: boolean;
    age_days: number | null;
    outdoor: boolean;
    pace_s_per_km: number;
    slug: string;
  } | null = null;

  for (const row of rows) {
    const spec = markBySlug(row.slug);
    if (!usable(row, spec)) continue;
    if (spec.group !== 'run' && spec.group !== 'race') continue;

    const effort = runEffort(row, spec);
    if (!effort) continue;
    const vdot = vdotFromEffort(effort);
    if (vdot == null) continue;
    const pace = paceForRaceDistance(vdot, HYROX_RUN_TOTAL_METERS);
    if (pace == null) continue;

    const candidate = {
      stretch: extrapolationCost(effort.distance_meters, HYROX_RUN_TOTAL_METERS),
      weakened: isWeakened(row, spec),
      age_days: row.age_days,
      // A registered road race has no `run_context`; it is street running by
      // definition, so only an explicit treadmill flag loses the tie-break.
      outdoor: row.run_context !== 'treadmill',
      pace_s_per_km: pace,
      slug: spec.slug,
    };
    best = best == null ? candidate : betterCandidate(best, candidate);
  }

  if (!best) return null;
  return {
    value_s: best.pace_s_per_km,
    source: 'marca',
    age_days: best.age_days,
    weakened: best.weakened,
    from_slug: best.slug,
  };
}

/**
 * The athlete's running level from the watch's VO₂max — the fallback for someone
 * who has never timed themselves but wears an Apple Watch. Same Daniels model,
 * one notch wider by construction (see `vdotFromWatchVo2max`).
 */
export function projectRunFromVo2max(
  vo2max: number | null,
  age_days: number | null,
): ProjectedMark | null {
  const vdot = vdotFromWatchVo2max(vo2max);
  if (vdot == null) return null;
  const pace = paceForRaceDistance(vdot, HYROX_RUN_TOTAL_METERS);
  if (pace == null) return null;
  return { value_s: pace, source: 'vo2max', age_days, weakened: false, from_slug: null };
}

// ── Ergs ─────────────────────────────────────────────────────────────────────

/**
 * The athlete's SkiErg / Row level for the race's 1000 m, expressed in the
 * per-500 m basis the cross compares in.
 *
 * The 1000 m mark is the same distance the race asks for, so it converts
 * directly. A 500 m mark is stretched with Riegel first — the fix for the ×2 that
 * used to promise every athlete a 1000 m at their sprint pace.
 */
export function projectErgMark(rows: readonly MarkRow[], erg: 'ski' | 'row'): ProjectedMark | null {
  let best: {
    stretch: number;
    weakened: boolean;
    age_days: number | null;
    outdoor: boolean;
    pace_s_per_500: number;
    slug: string;
  } | null = null;

  for (const row of rows) {
    const spec = markBySlug(row.slug);
    if (!usable(row, spec)) continue;
    if (spec.erg !== erg || spec.target_distance_m == null) continue;

    const splitTime = riegelTime(row.value, spec.target_distance_m, ERG_RACE_SPLIT_METERS);
    const candidate = {
      stretch: extrapolationCost(spec.target_distance_m, ERG_RACE_SPLIT_METERS),
      weakened: isWeakened(row, spec),
      age_days: row.age_days,
      outdoor: true, // ergs have no context axis; keeps the tie-break total
      pace_s_per_500: splitTime / (ERG_RACE_SPLIT_METERS / ERG_PACE_UNIT_METERS),
      slug: spec.slug,
    };
    best = best == null ? candidate : betterCandidate(best, candidate);
  }

  if (!best) return null;
  return {
    value_s: best.pace_s_per_500,
    source: 'marca',
    age_days: best.age_days,
    weakened: best.weakened,
    from_slug: best.slug,
  };
}
