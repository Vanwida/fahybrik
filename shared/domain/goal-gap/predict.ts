// @fahybrid/shared/domain/goal-gap — the per-segment PREDICTION (pure, no I/O).
//
// For each segment we predict the seconds the athlete will ACTUALLY spend, best
// evidence first, and tag both the tier and the source so a number never appears
// without provenance — plus a band, because a number without one is a claim we
// cannot back (ley 1).
//
//   1. OWN RACE SPLIT, aged. The strongest evidence: it already happened. It does
//      NOT freeze the prediction any more. It is blended with the current estimate,
//      its weight halving every EVIDENCE_HALF_LIFE_DAYS, so training moves the
//      number from the first week. With no estimate to blend into, the split
//      stands alone and its band widens with age instead.
//   2. ESTIMADO — the trained level (a measured mark, the watch's VO₂max, the
//      threshold, or logged training) scaled to a full segment split and taxed by
//      the athlete's personal competition factor.
//   3. SIN DATOS — neither. No number is fabricated, and the segment is named in
//      `coverage.unknown_slugs` so the caller must say so out loud.
//
// Roxzone has no trained level (you don't train transitions): it is predicted from
// the athlete's own race, aged like any other split, else sin_datos. It used to
// fall back to its own BUDGET — that is the goal wearing a disguise, and it is
// gone (ley 2).

import {
  bandForSource,
  blendAgedEvidence,
  evidenceWeight,
  BAND_OBSERVED,
  type EvidenceSource,
} from '../evidence';
import {
  type OwnRace,
  type PredictionTier,
  type SegmentDef,
  type TrainedKind,
  type TrainedLevel,
} from './types';

/**
 * Full-split multiplier for a trained level in the comparison basis.
 *
 * The erg ×2 is CORRECT and stays: the comparison basis for an erg is the average
 * pace per 500 m over the race's 1000 m, so two of them are the split. The old
 * "×2 lies about endurance" problem lives one layer up, at the point a 500 m TIME
 * TRIAL becomes that pace — and that is where the Riegel exponent now sits
 * (domain/athlete/mark-projection). Doing it here too would apply the penalty twice.
 */
function fullSplitMultiplier(kind: TrainedKind): number {
  if (kind === 'run') return 8; // s/km → 8 km run total
  if (kind === 'ski' || kind === 'row') return 2; // s/500 m → 1000 m split
  return 1; // functional practice seconds ≈ station split
}

/**
 * The athlete's personal transfer factor: how much slower they race than they
 * train, as a dimensionless multiplier.
 *
 * WEIGHTED BY THE TIME EACH SEGMENT COSTS IN THE RACE. It used to be a plain
 * arithmetic mean of the ratios, which gave the eight kilometres of running — half
 * the race — exactly the same say as one functional station lasting three minutes.
 * A single odd station could then drag every prediction the athlete had. The
 * weight is that segment's own race seconds (its comparison-basis value taken back
 * to a full split), so the factor is the ratio of total competed time to total
 * trained-equivalent time, which is what "how much slower do I race" means.
 *
 * Null when no cross target has both sides (→ caller applies no factor and widens
 * the band, because the tax is then unknown rather than zero).
 */
export function personalTransferFactor(trained: TrainedLevel[]): number | null {
  let weightedRatios = 0;
  let weights = 0;
  for (const t of trained) {
    if (t.trained_value_s == null || !(t.trained_value_s > 0)) continue;
    if (t.race_value_s == null || !(t.race_value_s > 0)) continue;
    const ratio = t.race_value_s / t.trained_value_s;
    const raceSeconds = t.race_value_s * fullSplitMultiplier(t.kind);
    weightedRatios += ratio * raceSeconds;
    weights += raceSeconds;
  }
  if (weights <= 0) return null;
  return weightedRatios / weights;
}

export interface SegmentPrediction {
  predicted_s: number | null;
  tier: PredictionTier;
  source: EvidenceSource;
  /** ± half-width in seconds; null iff sin_datos. */
  band_s: number | null;
  /** The mark slug behind an `estimado` from a measured mark, for the copy. */
  from_slug: string | null;
}

const SIN_DATOS: SegmentPrediction = {
  predicted_s: null,
  tier: 'sin_datos',
  source: 'sin_datos',
  band_s: null,
  from_slug: null,
};

/** The athlete's own raw split for one segment (full split, not comparison basis). */
function ownSplit(seg: SegmentDef, ownRace: OwnRace): number | null {
  if (seg.kind === 'run') return ownRace.run_total_s;
  if (seg.kind === 'roxzone') return ownRace.roxzone_s;
  const v = seg.station_index != null ? ownRace.station_s[seg.station_index] : undefined;
  return v ?? null;
}

/** The current estimate for a segment: trained level → full split × race tax. */
function estimateFromTrained(
  seg: SegmentDef,
  trainedBySlug: Map<string, TrainedLevel>,
  factor: number | null,
): { value_s: number; source: EvidenceSource; weakened: boolean; from_slug: string | null } | null {
  const trained = trainedBySlug.get(seg.slug);
  if (!trained || trained.trained_value_s == null || !(trained.trained_value_s > 0)) return null;
  const full = trained.trained_value_s * fullSplitMultiplier(trained.kind);
  return {
    value_s: full * (factor ?? 1),
    source: trained.source,
    // No personal factor means the competition tax is UNKNOWN, not zero: the
    // value is used as-is and the band pays for the assumption.
    weakened: trained.weakened || factor == null,
    from_slug: trained.from_slug,
  };
}

/**
 * Predict one segment.
 *
 * `own_race_age_days` is carried on the race itself; an undated race cannot be
 * aged, so it keeps full weight rather than being punished for a missing field.
 */
export function predictSegment(
  seg: SegmentDef,
  ownRace: OwnRace | null,
  trainedBySlug: Map<string, TrainedLevel>,
  factor: number | null,
): SegmentPrediction {
  const estimate = estimateFromTrained(seg, trainedBySlug, factor);
  const split = ownRace ? ownSplit(seg, ownRace) : null;

  // 1. The athlete's own split, aged against the current estimate.
  if (split != null && split > 0) {
    const age = ownRace?.age_days ?? null;
    const weight = evidenceWeight(age);
    // ONE rule for the tier, both branches: the race leads — and the segment reads
    // 'observado' — while it still outweighs the estimate, i.e. under one
    // half-life. That is exactly what the old RECENT_RACE_DAYS cliff asserted, so
    // the chip the installed app renders does not change meaning.
    const tier: PredictionTier = weight > 0.5 ? 'observado' : 'estimado';

    if (estimate) {
      const { value_s } = blendAgedEvidence(split, estimate.value_s, age);
      // Two mechanisms, never both at once: while there IS an estimate to blend
      // into, age moves WEIGHT, so the race keeps its fresh band and the mix
      // inherits the estimate's width in proportion.
      const band =
        weight * BAND_OBSERVED +
        (1 - weight) * bandForSource(estimate.source, { weakened: estimate.weakened });
      return {
        predicted_s: Math.round(value_s),
        tier,
        source: 'carrera',
        band_s: Math.round(value_s * band),
        from_slug: null,
      };
    }

    // Nothing to blend into — the split stands alone, so here age widens the BAND.
    const band = bandForSource('carrera', { age_days: age });
    return {
      predicted_s: Math.round(split),
      tier,
      source: 'carrera',
      band_s: Math.round(split * band),
      from_slug: null,
    };
  }

  // 2. Estimado — the trained level, taxed.
  if (estimate) {
    const band = bandForSource(estimate.source, { weakened: estimate.weakened });
    return {
      predicted_s: Math.round(estimate.value_s),
      tier: 'estimado',
      source: estimate.source,
      band_s: Math.round(estimate.value_s * band),
      from_slug: estimate.from_slug,
    };
  }

  // 3. Sin datos — no number invented, and the caller has to declare the hole.
  return SIN_DATOS;
}
