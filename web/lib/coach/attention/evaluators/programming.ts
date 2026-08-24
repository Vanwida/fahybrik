// Programming evaluators — transition readiness, programming health,
// microcycle-ending due-soon, and A-event proximity. Labels/details preserved
// from cohort.ts (transition) and the HOY redesign spec for the new ones.

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
  daysFromNowToIso,
} from '@fahybrid/shared/domain/coach/signals';

export const transitionReadyEvaluator: SignalEvaluator = {
  kind: 'transition_ready',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts): SignalResult {
    const fires = facts.transition_recommendation === 'advance';
    return {
      kind: 'transition_ready',
      fires,
      severity: 'warning',
      value: null,
      baseline: null,
      trend: null,
      label: 'Listo para el siguiente ciclo',
      detail: facts.transition_detail || 'Revisar deep-dive',
      dedupe_key: dedupeKey('transition_ready', facts.athlete_id),
    };
  },
};

export const programmingStatusEvaluator: SignalEvaluator = {
  kind: 'programming_status',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts): SignalResult {
    const fires = facts.programming_status !== 'ok';
    // block_ended is the hard escalation (athlete already ran dry).
    // month_2_pending is a proposal to validate, not the empty block.
    const severity = facts.programming_status === 'block_ended' ? 'critical' : 'warning';
    return {
      kind: 'programming_status',
      fires,
      severity,
      value: null,
      baseline: null,
      trend: null,
      label: facts.programming_label ?? 'Programación pendiente',
      detail: facts.programming_detail ?? '',
      dedupe_key: dedupeKey('programming_status', facts.athlete_id),
    };
  },
};

export const microcycleEndingEvaluator: SignalEvaluator = {
  kind: 'microcycle_ending',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds, now): SignalResult | null {
    if (facts.current_microcycle_end_iso == null) return null;
    const days = daysFromNowToIso(facts.current_microcycle_end_iso, now);
    const fires = days >= 0 && days <= thresholds.microcycle_ending_days;
    if (!fires) return null;
    return {
      kind: 'microcycle_ending',
      fires: true,
      severity: 'warning',
      value: days,
      baseline: thresholds.microcycle_ending_days,
      trend: null,
      label: `Ciclo acaba en ${days}d`,
      detail: facts.current_block_type
        ? `Ahora: ${facts.current_block_type} · asigna el siguiente`
        : 'Asigna el siguiente ciclo',
      dedupe_key: dedupeKey('microcycle_ending', facts.athlete_id),
    };
  },
};

export const aEventNearEvaluator: SignalEvaluator = {
  kind: 'a_event_near',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    const days = facts.days_to_a_event;
    if (days == null) return null;
    const fires = days >= 0 && days <= thresholds.a_event_near_days;
    if (!fires) return null;
    return {
      kind: 'a_event_near',
      fires: true,
      severity: 'warning',
      value: days,
      baseline: thresholds.a_event_near_days,
      trend: null,
      label: facts.a_event_name ? `${facts.a_event_name} · ${days}d` : `Evento A en ${days}d`,
      detail: 'carrera objetivo cerca',
      dedupe_key: dedupeKey('a_event_near', facts.athlete_id),
    };
  },
};
