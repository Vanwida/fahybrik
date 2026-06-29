// Progression evaluators — the athlete→coach improvement loop.
//
// KEYSTONE-fed: now that every post-onboarding test appends an athlete_benchmarks
// row, a self-entered/coach test (and a finished race) converts athlete progress
// into a coach ACTION instead of a read-only number nobody acts on.
//   - test_logged     → a recent test (esp. a PR) → review / progress the load.
//   - race_completed  → a finished race → review level + next block.
//   - test_due        → no test in a while on an active plan → schedule one.

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
} from '@fahybrid/shared/domain/coach/signals';

const DAY_MS = 86_400_000;

function wholeDaysSince(at: Date, now: Date): number {
  return Math.floor((now.getTime() - at.getTime()) / DAY_MS);
}

export const testLoggedEvaluator: SignalEvaluator = {
  kind: 'test_logged',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds, now): SignalResult | null {
    if (facts.latest_test_at == null) return null;
    const days = wholeDaysSince(facts.latest_test_at, now);
    if (days < 0 || days > thresholds.test_logged_recent_days) return null;
    const what = facts.latest_test_label ?? 'test';
    return {
      kind: 'test_logged',
      fires: true,
      severity: 'warning',
      value: days,
      baseline: thresholds.test_logged_recent_days,
      trend: facts.latest_test_is_pr ? 'up' : null,
      label: facts.latest_test_is_pr ? 'PR registrado' : 'Test registrado',
      detail: facts.latest_test_is_pr
        ? `${what} · récord — revisa y sube carga`
        : `${what} · revisa el resultado`,
      // The day of the test is part of the identity so a NEW test (newer day) is a
      // distinct item a resolved card never masks.
      dedupe_key: dedupeKey(
        'test_logged',
        facts.athlete_id,
        facts.latest_test_at.toISOString().slice(0, 10),
      ),
    };
  },
};

export const raceCompletedEvaluator: SignalEvaluator = {
  kind: 'race_completed',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds, now): SignalResult | null {
    if (facts.latest_race_completed_at == null) return null;
    const days = wholeDaysSince(facts.latest_race_completed_at, now);
    if (days < 0 || days > thresholds.race_completed_recent_days) return null;
    const name = facts.latest_race_name ?? 'Carrera';
    return {
      kind: 'race_completed',
      fires: true,
      severity: 'warning',
      value: days,
      baseline: thresholds.race_completed_recent_days,
      trend: null,
      label: `${name} · completada`,
      detail: 'Revisa nivel y el siguiente bloque',
      dedupe_key: dedupeKey('race_completed', facts.athlete_id, facts.latest_race_id ?? undefined),
    };
  },
};

export const testDueEvaluator: SignalEvaluator = {
  kind: 'test_due',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    // Only meaningful on an active plan — no microciclo, nothing to test for.
    if (facts.current_microcycle_end_iso == null) return null;
    if (facts.days_since_last_test == null) return null;
    if (facts.days_since_last_test < thresholds.test_due_days) return null;
    return {
      kind: 'test_due',
      fires: true,
      severity: 'warning',
      value: facts.days_since_last_test,
      baseline: thresholds.test_due_days,
      trend: null,
      label: 'Toca test',
      detail: `Sin test desde hace ${facts.days_since_last_test}d · programa una prueba`,
      dedupe_key: dedupeKey('test_due', facts.athlete_id),
    };
  },
};
