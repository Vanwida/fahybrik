// @fahybrid/shared/domain/goal-gap — PREDICTED vs REAL (pure, no I/O).
//
// Honest hindsight: take the frozen pre-event snapshot and the real splits (an
// imported race or a hyrox_sim execution) and read, segment by segment, how the
// prediction held. Only segments with BOTH a predicted and a real value are
// compared (never a fabricated pairing). The insight is a DETERMINISTIC template
// off the worst positive delta — no LLM.

import { accuracyLabel } from './label';

/** One segment of the frozen snapshot (subset of the stored segments_json). */
export interface SnapshotSegment {
  slug: string;
  label_es: string;
  predicted_s: number | null;
}

export interface PredictionReviewInput {
  /** Frozen predicted total from the snapshot. */
  predicted_total_s: number;
  /** Real event total (race result_time, or the summed execution segments). */
  actual_total_s: number;
  snapshot_segments: SnapshotSegment[];
  /** Real seconds per segment slug; a slug missing/null means "not recorded". */
  actual_by_slug: Record<string, number | null>;
}

export interface ReviewSegment {
  slug: string;
  label_es: string;
  predicted_s: number;
  actual_s: number;
  /** actual − predicted (positive = slower than predicted). */
  delta_s: number;
}

export interface PredictionReviewResult {
  predicted_total_s: number;
  actual_total_s: number;
  /** 100 − |predicted − actual| / actual × 100, clamped to [0,100], rounded. */
  accuracy_pct: number;
  /** Spanish precision label derived from accuracy_pct ('clavado' … 'aún lejos'). */
  accuracy_label_es: string;
  segments: ReviewSegment[];
  insight_es: string;
}

/** Seconds → "m:ss" (absolute). */
function mmss(seconds: number): string {
  const t = Math.round(Math.abs(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** The single-sentence insight, chosen deterministically from the worst delta. */
function buildInsight(segments: ReviewSegment[]): string {
  if (segments.length === 0) return 'Sin segmentos comparables entre la predicción y la carrera.';
  // Worst = the segment the athlete lost the most time on vs the prediction.
  const worst = segments.reduce((a, b) => (b.delta_s > a.delta_s ? b : a));
  if (worst.delta_s > 0) {
    return `El ${worst.label_es} perdió ${mmss(worst.delta_s)} más de lo previsto.`;
  }
  return 'Cumpliste la predicción: cada segmento fue igual o mejor de lo previsto.';
}

export function computePredictionReview(input: PredictionReviewInput): PredictionReviewResult {
  const segments: ReviewSegment[] = [];
  for (const s of input.snapshot_segments) {
    if (s.predicted_s == null || s.predicted_s <= 0) continue;
    const actual = input.actual_by_slug[s.slug];
    if (actual == null || actual <= 0) continue;
    segments.push({
      slug: s.slug,
      label_es: s.label_es,
      predicted_s: Math.round(s.predicted_s),
      actual_s: Math.round(actual),
      delta_s: Math.round(actual) - Math.round(s.predicted_s),
    });
  }

  const accuracy_pct =
    input.actual_total_s > 0
      ? Math.max(
          0,
          Math.min(100, Math.round(100 - (Math.abs(input.predicted_total_s - input.actual_total_s) / input.actual_total_s) * 100)),
        )
      : 0;

  return {
    predicted_total_s: Math.round(input.predicted_total_s),
    actual_total_s: Math.round(input.actual_total_s),
    accuracy_pct,
    accuracy_label_es: accuracyLabel(accuracy_pct),
    segments,
    insight_es: buildInsight(segments),
  };
}
