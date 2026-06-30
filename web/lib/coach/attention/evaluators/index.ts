// Registry of every pure signal evaluator + the `evaluateAll` driver.
//
// The registry is EXHAUSTIVE over `SIGNAL_KINDS` — `Record<SignalKind, ...>`
// makes a missing kind a compile error, and a unit test asserts it at runtime.
// `evaluateAll` runs every ENABLED evaluator and returns only firing results;
// disabled (F7 flagged-off) evaluators are skipped entirely, so they emit
// nothing into the HOY queue.

import {
  type SignalKind,
  type SignalEvaluator,
  type SignalFacts,
  type SignalResult,
  type EffectiveThresholds,
} from '@fahybrid/shared/domain/coach/signals';

import {
  hrvCrashEvaluator,
  noSyncEvaluator,
  missedSessionsEvaluator,
  rpeHighEvaluator,
  checkinSkippedEvaluator,
  messageUnansweredEvaluator,
} from './biometric';
import { readinessLowEvaluator } from './readiness';
import {
  transitionReadyEvaluator,
  programmingStatusEvaluator,
  microcycleEndingEvaluator,
  aEventNearEvaluator,
} from './programming';
import {
  intakePendingEvaluator,
  weekAdjustmentPendingEvaluator,
  monthlyBlockPendingEvaluator,
  billingAtRiskEvaluator,
} from './queue';
import {
  testLoggedEvaluator,
  raceCompletedEvaluator,
  workoutLibreEvaluator,
  testDueEvaluator,
} from './progression';
import { FLAGGED_OFF_EVALUATORS } from './flagged-off';

const BACKED_EVALUATORS: SignalEvaluator[] = [
  hrvCrashEvaluator,
  noSyncEvaluator,
  missedSessionsEvaluator,
  rpeHighEvaluator,
  checkinSkippedEvaluator,
  messageUnansweredEvaluator,
  readinessLowEvaluator,
  transitionReadyEvaluator,
  programmingStatusEvaluator,
  microcycleEndingEvaluator,
  aEventNearEvaluator,
  intakePendingEvaluator,
  weekAdjustmentPendingEvaluator,
  monthlyBlockPendingEvaluator,
  billingAtRiskEvaluator,
  testLoggedEvaluator,
  raceCompletedEvaluator,
  workoutLibreEvaluator,
  testDueEvaluator,
];

/**
 * The exhaustive registry. Built from the backed + flagged-off lists and typed
 * as `Record<SignalKind, ...>` so the type checker rejects any missing kind.
 */
export const SIGNAL_EVALUATORS: Record<SignalKind, SignalEvaluator> = Object.fromEntries(
  [...BACKED_EVALUATORS, ...FLAGGED_OFF_EVALUATORS].map((e) => [e.kind, e]),
) as Record<SignalKind, SignalEvaluator>;

/**
 * Run every ENABLED evaluator for one athlete and return only the signals that
 * fire. Both `null` and `{ fires: false }` are treated as auto-resolve (no card).
 */
export function evaluateAll(
  facts: SignalFacts,
  thresholds: EffectiveThresholds,
  now: Date,
): SignalResult[] {
  const out: SignalResult[] = [];
  for (const evaluator of Object.values(SIGNAL_EVALUATORS)) {
    if (!evaluator.enabled) continue;
    const result = evaluator.evaluate(facts, thresholds, now);
    if (result?.fires) out.push(result);
  }
  return out;
}
