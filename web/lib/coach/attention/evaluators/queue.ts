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
import { shortDate } from '@fahybrid/shared/domain/coach/athlete-state';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

/** «5 h» / «3 d». */
function waited(hours: number): string {
  return hours < 24 ? `${Math.max(1, Math.floor(hours))} h` : `${Math.floor(hours / 24)} d`;
}

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
      label: 'Alta pendiente',
      detail: facts.intake_a_event_name
        ? `terminó el cuestionario hace ${waited(hours)} · ${facts.intake_a_event_name} en ${facts.intake_a_event_days} d`
        : `terminó el cuestionario hace ${waited(hours)}`,
      window_label: null,
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
      label: 'Ajuste de semana propuesto',
      detail: facts.week_adjustment_summary ?? 'pendiente de revisar',
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
      label: 'Programa propuesto',
      detail: facts.monthly_block_month_name
        ? `${facts.monthly_block_month_name} · pendiente de validar`
        : 'pendiente de validar',
      dedupe_key: dedupeKey('monthly_block_pending', facts.athlete_id, id),
    };
  },
};

export const billingAtRiskEvaluator: SignalEvaluator = {
  kind: 'billing_at_risk',
  default_severity: 'critical',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
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
        label: 'Pago vencido',
        detail: 'la suscripción está impagada',
        dedupe_key: dedupeKey('billing_at_risk', facts.athlete_id),
      };
    }
    // renewal_soon = canceló y su periodo termina. A partir de los días del coach
    // (`renewal_alert_days`, defecto 7) es VIGILAR: «Se da de baja en N d», y la
    // acción es escribirle (`signalActionFor`: un pago no vencido no se
    // «recuerda»). Antes, informativa: la baja de la semana no salía en Hoy.
    // La fecha de la baja manda; los días se cuentan en el día del atleta (la
    // resta del barrido va en UTC y de madrugada se corre uno).
    const ends =
      facts.billing_period_end_iso ??
      isoDateString(addDays(parseIsoDate(facts.today_iso), facts.billing_days_to_period_end ?? 0));
    const d = Math.max(
      0,
      Math.round((parseIsoDate(ends).getTime() - parseIsoDate(facts.today_iso).getTime()) / 86_400_000),
    );
    const soon = d <= (thresholds.renewal_alert_days ?? 7);
    return {
      kind: 'billing_at_risk',
      fires: true,
      severity: soon ? 'warning' : 'info',
      value: d,
      baseline: null,
      trend: null,
      label: d === 0 ? 'Se da de baja hoy' : `Se da de baja en ${d} d`,
      detail: `canceló la suscripción · termina el ${shortDate(ends)}`,
      observed_at: `${ends}T12:00:00.000Z`,
      window_label: `${thresholds.renewal_alert_days ?? 7} d`,
      dedupe_key: dedupeKey('billing_at_risk', facts.athlete_id),
    };
  },
};
