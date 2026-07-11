// @fahybrid/shared/domain/goal-gap — the per-segment PREDICTION (pure, no I/O).
//
// For each segment we predict the seconds the athlete will ACTUALLY spend, best
// evidence first, and tag the tier so a number never appears without provenance:
//
//   1. observado — the athlete's own RECENT (< RECENT_RACE_DAYS) race split, used
//                  raw. The strongest evidence: it already happened.
//   2. estimado  — no recent split, but a trained level exists: scale it to a full
//                  segment split (run ×8, erg ×2, functional ×1) and apply the
//                  athlete's PERSONAL transfer factor (mean race ÷ trained across
//                  the cross targets where both exist — their competition "tax").
//                  When the athlete has no race at all there is no factor, so the
//                  trained level is used as-is (still 'estimado').
//   3. sin_datos — neither; no number is fabricated (the gap board shows the door).
//
// Roxzone has no trained level (you don't train transitions): it is observado from
// a recent own race, estimado from a stale own race or the cohort typical
// (its budget), else sin_datos.

import {
  RECENT_RACE_DAYS,
  type OwnRace,
  type PredictionTier,
  type SegmentDef,
  type TrainedKind,
  type TrainedLevel,
} from './types';

/** Full-split multiplier for a trained level in the comparison basis. */
function fullSplitMultiplier(kind: TrainedKind): number {
  if (kind === 'run') return 8; // s/km → 8 km run total
  if (kind === 'ski' || kind === 'row') return 2; // s/500 m → 1000 m split
  return 1; // functional practice seconds ≈ station split
}

/**
 * The athlete's personal transfer factor: the mean of (competed ÷ trained) across
 * every cross target where BOTH sides exist, in the comparison basis (so it is a
 * dimensionless multiplier — how much slower the athlete races than they train).
 * Null when the athlete has no race split to compare (→ caller uses no factor).
 */
export function personalTransferFactor(trained: TrainedLevel[]): number | null {
  const ratios: number[] = [];
  for (const t of trained) {
    if (t.trained_value_s != null && t.trained_value_s > 0 && t.race_value_s != null && t.race_value_s > 0) {
      ratios.push(t.race_value_s / t.trained_value_s);
    }
  }
  if (ratios.length === 0) return null;
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

export interface SegmentPrediction {
  predicted_s: number | null;
  tier: PredictionTier;
}

/** Own recent race = a dated race younger than RECENT_RACE_DAYS. */
function isRecent(ownRace: OwnRace | null): boolean {
  return ownRace != null && ownRace.age_days != null && ownRace.age_days < RECENT_RACE_DAYS;
}

/** The athlete's own raw split for one segment (full split, not comparison basis). */
function ownSplit(seg: SegmentDef, ownRace: OwnRace): number | null {
  if (seg.kind === 'run') return ownRace.run_total_s;
  if (seg.kind === 'roxzone') return ownRace.roxzone_s;
  const v = seg.station_index != null ? ownRace.station_s[seg.station_index] : undefined;
  return v ?? null;
}

/**
 * Predict one segment. `budgetForRoxzone` is this segment's budget in seconds,
 * used only as the cohort-typical roxzone fallback (roxzone has no trained level).
 */
export function predictSegment(
  seg: SegmentDef,
  ownRace: OwnRace | null,
  trainedBySlug: Map<string, TrainedLevel>,
  factor: number | null,
  budgetForSegment: number,
): SegmentPrediction {
  const recent = isRecent(ownRace);

  // 1. Observado — a recent own-race split for this segment.
  if (recent && ownRace) {
    const split = ownSplit(seg, ownRace);
    if (split != null && split > 0) return { predicted_s: Math.round(split), tier: 'observado' };
  }

  if (seg.kind === 'roxzone') {
    // A stale own roxzone still beats a cohort typical (it's the athlete's own).
    if (ownRace?.roxzone_s != null && ownRace.roxzone_s > 0) {
      return { predicted_s: Math.round(ownRace.roxzone_s), tier: 'estimado' };
    }
    // Cohort-typical roxzone: its budget fraction (only meaningful for a cohort
    // budget; a 'tu_carrera' budget implies an own race handled above).
    if (budgetForSegment > 0) return { predicted_s: budgetForSegment, tier: 'estimado' };
    return { predicted_s: null, tier: 'sin_datos' };
  }

  // 2. Estimado — trained level scaled to a full split × personal factor.
  const trained = trainedBySlug.get(seg.slug);
  if (trained && trained.trained_value_s != null && trained.trained_value_s > 0) {
    const full = trained.trained_value_s * fullSplitMultiplier(trained.kind);
    const predicted = full * (factor ?? 1);
    return { predicted_s: Math.round(predicted), tier: 'estimado' };
  }

  // 3. Sin datos — no number invented.
  return { predicted_s: null, tier: 'sin_datos' };
}
