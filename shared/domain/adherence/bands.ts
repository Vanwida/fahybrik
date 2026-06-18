// Adherence bands — the CONFIG that decides whether a prescribed-vs-real delta
// is "En objetivo" (green), "Cerca / Por debajo" (amber) or "Fuera" (red),
// keyed by what kind of thing was measured (HOY redesign, SPEC §5/§9).
//
// WHY PER-KIND (the build-right point)
// ------------------------------------
// A 1-point RIR miss is NOT the same severity as a 25% distance miss. Adherence
// can't be a single global "±10% / ±25%" rule because the kinds aren't
// commensurable: pace and %1RM are relative-percent metrics, but RIR / RPE /
// HR-zone are small INTEGER scales where "10%" is meaningless — a band on those
// must be expressed in ABSOLUTE units (e.g. "within 1 RIR"). This file makes the
// band thresholds overridable per `TargetKind` (intensity) and per `MeasureKind`
// (work done), so each metric is judged on its own scale.
//
// This module is CONFIG + TYPES ONLY. The compute (taking a prescribed value, a
// real value, choosing the kind, applying the right comparator → a band) lands
// in F6 (`shared/domain/adherence/compute.ts`). Nothing here reads data.
//
// Reuses the prescription domain's `TargetKind` / `MeasureKind` enums (single
// source of truth) — it does not redefine them.

import type { MeasureKind, TargetKind } from '../prescription/types';

// ── Band ──────────────────────────────────────────────────────────────────────

/** The three adherence outcomes plus the "no detail to compare" floor. */
export const ADHERENCE_BANDS = ['on_target', 'near', 'off_target', 'no_detail'] as const;
export type AdherenceBand = (typeof ADHERENCE_BANDS)[number];

/** Coach-facing copy per band (Spanish, per SPEC §5). `no_detail` = gris. */
export const ADHERENCE_BAND_LABEL: Record<AdherenceBand, string> = {
  on_target: 'En objetivo',
  near: 'Cerca',
  off_target: 'Fuera',
  no_detail: 'Sin detalle',
};

/** Maps each band onto the shared semantic tier (color + icon live there). */
export const ADHERENCE_BAND_TIER: Record<AdherenceBand, 'success' | 'warning' | 'error' | 'neutral'> = {
  on_target: 'success',
  near: 'warning',
  off_target: 'error',
  no_detail: 'neutral',
};

// ── Band rule ──────────────────────────────────────────────────────────────────

/**
 * How a metric's delta is compared to its band thresholds.
 *  - `relative`: |Δ| as a FRACTION of the prescribed value (pace, %RM, kg,
 *    distance, duration, calories, reps) — thresholds are fractions (0.10 = 10%).
 *  - `absolute`: |Δ| in the metric's own UNITS (RIR, RPE, HR-zone steps) —
 *    thresholds are raw point differences (1 = within 1 point).
 */
export type AdherenceComparator = 'relative' | 'absolute';

/**
 * A band rule: anything with |Δ| at or below `on_target_max` is green, at or
 * below `near_max` is amber, beyond that is red. Units of the two maxima are
 * interpreted per `comparator`.
 */
export interface AdherenceBandRule {
  comparator: AdherenceComparator;
  /** Upper bound of the green ("En objetivo") band, inclusive. */
  on_target_max: number;
  /** Upper bound of the amber ("Cerca / Por debajo") band, inclusive. */
  near_max: number;
}

// ── Default rule (SPEC §5) ─────────────────────────────────────────────────────

/** Relative-percent default: |Δ| ≤ 10% green · ≤ 25% amber · > 25% red. */
export const DEFAULT_BAND_RULE: AdherenceBandRule = {
  comparator: 'relative',
  on_target_max: 0.1,
  near_max: 0.25,
};

/**
 * Absolute-scale default for small integer metrics (RIR / RPE / HR-zone):
 * within 1 point green · within 2 points amber · beyond red. Used by the
 * per-target overrides below; exported so F6's compute can reference it.
 */
export const DEFAULT_ABSOLUTE_RULE: AdherenceBandRule = {
  comparator: 'absolute',
  on_target_max: 1,
  near_max: 2,
};

// ── Per-kind overrides ─────────────────────────────────────────────────────────
//
// Only kinds that deviate from DEFAULT_BAND_RULE appear here. Everything else
// falls back to the relative-percent default. Look-ups should be: target
// override → measure override → DEFAULT_BAND_RULE (compute order lands in F6).

/** Intensity-target kinds whose band rule differs from the relative default. */
export const TARGET_BAND_OVERRIDES: Partial<Record<TargetKind, AdherenceBandRule>> = {
  // Small integer scales — judged in absolute points, not percent.
  rir: DEFAULT_ABSOLUTE_RULE,
  rpe: DEFAULT_ABSOLUTE_RULE,
  hr_zone: { comparator: 'absolute', on_target_max: 0, near_max: 1 }, // exact zone green; ±1 zone amber
  // bodyweight has no numeric target → no delta to band (compute returns no_detail).
};

/** Work-measure kinds whose band rule differs from the relative default. */
export const MEASURE_BAND_OVERRIDES: Partial<Record<MeasureKind, AdherenceBandRule>> = {
  // reps / distance / duration / calories all use the relative-percent default;
  // declared empty so the override surface is explicit and future edits land here.
};

/**
 * Resolve the band rule for a given metric, preferring a target override, then a
 * measure override, then the relative-percent default. (Pure config look-up —
 * the actual delta→band evaluation is F6.)
 */
export function bandRuleFor(params: {
  target_kind?: TargetKind | null;
  measure_kind?: MeasureKind | null;
}): AdherenceBandRule {
  if (params.target_kind && TARGET_BAND_OVERRIDES[params.target_kind]) {
    return TARGET_BAND_OVERRIDES[params.target_kind]!;
  }
  if (params.measure_kind && MEASURE_BAND_OVERRIDES[params.measure_kind]) {
    return MEASURE_BAND_OVERRIDES[params.measure_kind]!;
  }
  return DEFAULT_BAND_RULE;
}
