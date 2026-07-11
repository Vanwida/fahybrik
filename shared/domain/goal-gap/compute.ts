// @fahybrid/shared/domain/goal-gap — the orchestration (pure, no I/O).
//
// computeGoalGap(input) joins the BUDGET (goal decomposed) and the PREDICTION
// (history projected) into the per-segment gap read. The two are aligned segment
// by segment so delta_s = predicted − budget is meaningful, and the predicted
// total holds the sin_datos segments at their BUDGET ("if you hold the plan where
// we can't see you") so the total is always a real number the gap can be read off.

import { computeBudget } from './budget';
import { personalTransferFactor, predictSegment } from './predict';
import type { GoalGapInput, GoalGapResult, SegmentResult, TrainedLevel } from './types';

export function computeGoalGap(input: GoalGapInput): GoalGapResult {
  const { goal_total_s, segments, cohort, own_race, trained } = input;

  const budget = computeBudget(goal_total_s, segments, cohort, own_race);
  if (!budget) {
    return { budget_source: null, segments: [], predicted_total_s: null, gap_s: null };
  }

  const trainedBySlug = new Map<string, TrainedLevel>();
  for (const t of trained) trainedBySlug.set(t.slug, t);
  const factor = personalTransferFactor(trained);

  const results: SegmentResult[] = segments.map((seg, i) => {
    const budget_s = budget.budgets[i] ?? 0;
    const { predicted_s, tier } = predictSegment(seg, own_race, trainedBySlug, factor, budget_s);
    const delta_s = predicted_s != null ? predicted_s - budget_s : null;
    return { slug: seg.slug, label_es: seg.label_es, kind: seg.kind, budget_s, predicted_s, tier, delta_s };
  });

  // The predicted total holds sin_datos segments at BUDGET (documented convention).
  const predicted_total_s = results.reduce((sum, r) => sum + (r.predicted_s ?? r.budget_s), 0);
  const gap_s = predicted_total_s - goal_total_s;

  return { budget_source: budget.source, segments: results, predicted_total_s, gap_s };
}
