// Coach-queue decision items + billing — intake, week-adjustment and
// monthly-block proposals (presence = pending), plus subscription risk.
// Proposal-backed signals embed the proposal id in the dedupe key so a NEW
// proposal after one is resolved is a distinct card (avoids a stale card
// masking a fresh one). Extracted from inbox.ts escalation logic.

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
} from '@fahybrid/shared/domain/coach/signals';

export const intakePendingEvaluator: SignalEvaluator = {
  kind: 'intake_pending',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    const hours = facts.intake_pending_hours;
    if (hours == null) return null;
    const critical = hours >= thresholds.intake_critical_hours;
    return {
      kind: 'intake_pending',
      fires: true,
      severity: critical ? 'critical' : 'warning',
      value: hours,
      baseline: thresholds.intake_critical_hours,
      trend: null,
      label: critical ? `Intake ${Math.floor(hours / 24)}d` : 'Intake pendiente',
      detail: facts.intake_a_event_name
        ? `${facts.intake_a_event_name} · ${facts.intake_a_event_days}d`
        : 'sin plan tras onboarding',
      // No suffix — at most one intake is pending per athlete at a time.
      dedupe_key: dedupeKey('intake_pending', facts.athlete_id),
    };
  },
};

export const weekAdjustmentPendingEvaluator: SignalEvaluator = {
  kind: 'week_adjustment_pending',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts): SignalResult | null {
    const id = facts.week_adjustment_proposal_id;
    if (id == null) return null;
    return {
      kind: 'week_adjustment_pending',
      fires: true,
      severity: 'warning',
      value: null,
      baseline: null,
      trend: null,
      label: 'Ajuste semanal IA',
      detail: facts.week_adjustment_summary ?? 'Propuesta pendiente de revisión',
      dedupe_key: dedupeKey('week_adjustment_pending', facts.athlete_id, id),
    };
  },
};

export const monthlyBlockPendingEvaluator: SignalEvaluator = {
  kind: 'monthly_block_pending',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts): SignalResult | null {
    const id = facts.monthly_block_proposal_id;
    if (id == null) return null;
    return {
      kind: 'monthly_block_pending',
      fires: true,
      severity: 'warning',
      value: null,
      baseline: null,
      trend: null,
      label: 'Bloque mensual',
      detail: facts.monthly_block_month_name
        ? `${facts.monthly_block_month_name} pendiente`
        : 'Propuesta de bloque pendiente',
      dedupe_key: dedupeKey('monthly_block_pending', facts.athlete_id, id),
    };
  },
};

export const billingAtRiskEvaluator: SignalEvaluator = {
  kind: 'billing_at_risk',
  default_severity: 'critical',
  enabled: true,
  evaluate(facts): SignalResult | null {
    const risk = facts.billing_risk;
    if (risk == null) return null;

    if (risk === 'past_due') {
      return {
        kind: 'billing_at_risk',
        fires: true,
        severity: 'critical',
        value: null,
        baseline: null,
        trend: null,
        label: 'Pago fallido',
        detail: 'suscripción vencida',
        dedupe_key: dedupeKey('billing_at_risk', facts.athlete_id),
      };
    }
    // renewal_soon
    return {
      kind: 'billing_at_risk',
      fires: true,
      severity: 'warning',
      value: facts.billing_days_to_period_end,
      baseline: null,
      trend: null,
      label: 'Renovación próxima',
      detail: `vence en ${facts.billing_days_to_period_end}d`,
      dedupe_key: dedupeKey('billing_at_risk', facts.athlete_id),
    };
  },
};
