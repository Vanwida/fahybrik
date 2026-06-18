// Readiness evaluator — uses the single-source readiness bands (67 / 45) from
// lib/dashboard/constants/readiness.ts. Below the caution floor (45) → critical
// ("en rojo"); between caution and OK (45–66) → warning ("con cautela").

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
} from '@fahybrid/shared/domain/coach/signals';
import {
  READINESS_OK_MIN,
  READINESS_CAUTION_MIN,
} from '@/lib/dashboard/constants/readiness';

export const readinessLowEvaluator: SignalEvaluator = {
  kind: 'readiness_low',
  default_severity: 'critical',
  enabled: true,
  evaluate(facts): SignalResult | null {
    const score = facts.readiness_score;
    if (score == null) return null;

    if (score < READINESS_CAUTION_MIN) {
      return {
        kind: 'readiness_low',
        fires: true,
        severity: 'critical',
        value: score,
        baseline: READINESS_OK_MIN,
        trend: null,
        label: `Readiness ${score}%`,
        detail: 'en rojo',
        dedupe_key: dedupeKey('readiness_low', facts.athlete_id),
      };
    }
    if (score < READINESS_OK_MIN) {
      return {
        kind: 'readiness_low',
        fires: true,
        severity: 'warning',
        value: score,
        baseline: READINESS_OK_MIN,
        trend: null,
        label: `Readiness ${score}%`,
        detail: 'con cautela',
        dedupe_key: dedupeKey('readiness_low', facts.athlete_id),
      };
    }
    return null;
  },
};
