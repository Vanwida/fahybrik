// @fahybrid/shared/domain/goal-gap — the orchestration (pure, no I/O).
//
// computeGoalGap(input) joins the BUDGET (goal decomposed) and the PREDICTION
// (history projected) into the per-segment gap read.
//
// THE TOTAL IS THE PART THAT CHANGED. It used to be Σ (predicted ?? BUDGET): the
// segments we could not see were quietly costed at whatever the athlete's GOAL
// asked of them. For anyone with real data everywhere that was invisible; for a
// beginner with no station splits it meant the app added up their goal and told
// them they were on track for it. The gap tended to zero exactly for the athletes
// furthest from their goal.
//
// Now: a segment with no evidence contributes NOTHING and is named. A race total
// only exists when all ten segments do (`coverage.complete`); short of that the
// caller gets `projection.known_total_s` — the time we can account for — and has
// to say so. The budget is still built, because the per-segment bars and the
// delta need it; it just never leaks into the prediction again.

import { composeBands } from '../evidence';
import { computeBudget } from './budget';
import { rankNextInputs } from './next-input';
import { personalTransferFactor, predictSegment } from './predict';
import type {
  CoverageRead,
  GoalGapInput,
  GoalGapResult,
  ProjectionRead,
  SegmentResult,
  TrainedLevel,
} from './types';

/** Sources that ARE the athlete's own race clock, for the confidence share. */
const OBSERVED_SOURCES = new Set(['carrera', 'simulacion']);

export function computeGoalGap(input: GoalGapInput): GoalGapResult {
  const { goal_total_s, segments, cohort, own_race, trained } = input;

  const budget = computeBudget(goal_total_s, segments, cohort, own_race);

  const trainedBySlug = new Map<string, TrainedLevel>();
  for (const t of trained) trainedBySlug.set(t.slug, t);
  const factor = personalTransferFactor(trained);

  const results: SegmentResult[] = segments.map((seg, i) => {
    const budget_s = budget ? (budget.budgets[i] ?? null) : null;
    const { predicted_s, tier, source, band_s } = predictSegment(seg, own_race, trainedBySlug, factor);
    const delta_s = predicted_s != null && budget_s != null ? predicted_s - budget_s : null;
    return { slug: seg.slug, label_es: seg.label_es, kind: seg.kind, budget_s, predicted_s, tier, source, band_s, delta_s };
  });

  // ── Coverage: what we can account for, and what we cannot ───────────────────
  const unknown_slugs = results.filter((r) => r.predicted_s == null).map((r) => r.slug);
  const coverage: CoverageRead = {
    known: results.length - unknown_slugs.length,
    total: results.length,
    unknown_slugs,
    complete: unknown_slugs.length === 0 && results.length > 0,
  };

  // ── Projection: the centre, its band, and how to tighten it ─────────────────
  let known_total_s = 0;
  let observed_total_s = 0;
  const bands: number[] = [];
  for (const r of results) {
    if (r.predicted_s == null) continue;
    known_total_s += r.predicted_s;
    if (OBSERVED_SOURCES.has(r.source)) observed_total_s += r.predicted_s;
    if (r.band_s != null) bands.push(r.band_s);
  }
  const band_s = Math.round(composeBands(bands));
  const projection: ProjectionRead = {
    known_total_s,
    band_s,
    low_s: Math.max(0, known_total_s - band_s),
    high_s: known_total_s + band_s,
    observed_share_pct: known_total_s > 0 ? Math.round((observed_total_s / known_total_s) * 100) : 0,
    next_inputs: rankNextInputs(segments, results),
  };

  // A race total exists only when every segment does. Anything else would be an
  // under-count wearing the clothes of a prediction.
  const predicted_total_s = coverage.complete ? known_total_s : null;
  const gap_s = predicted_total_s != null ? predicted_total_s - goal_total_s : null;

  return {
    budget_source: budget?.source ?? null,
    segments: results,
    predicted_total_s,
    gap_s,
    coverage,
    projection,
  };
}
