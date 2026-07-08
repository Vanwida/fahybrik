// Revisión 1:1 recurrente vencida (#21). Pure evaluator (mismo contrato que
// billingAtRiskEvaluator): dispara cuando el atleta lleva más días que su cadencia
// (mensual=30d / trimestral=90d, umbral en signal-config) sin una 1:1 Y no tiene una
// revisión próxima reservada. Cadencia 'ninguna' → nunca dispara.
//
// PAUSA (#13): esta señal NO se silencia aquí — se silencia AGUAS ARRIBA. El batch de
// recompute (recompute-batch.ts) solo produce facts para atletas con lifecycle_status
// ='activo', así que un atleta pausado/baja nunca llega al evaluador. Coherente con el
// resto de señales (no inventamos un segundo mecanismo de silencio).

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
} from '@fahybrid/shared/domain/coach/signals';
import { reviewThresholdDays } from '@fahybrid/shared/domain/coach/reviews';

export const reviewDueEvaluator: SignalEvaluator = {
  kind: 'review_1on1_due',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    // Los NÚMEROS viven en signal-config (thresholds inyectados); aquí solo mapeamos
    // cadencia → umbral efectivo. 'ninguna' → null → nunca vence.
    const thresholdDays = reviewThresholdDays(facts.review_cadence, {
      mensual: thresholds.review_due_mensual_days,
      trimestral: thresholds.review_due_trimestral_days,
    });
    if (thresholdDays == null) return null;
    if (facts.has_upcoming_review) return null; // ya hay una revisión reservada

    const days = facts.days_since_last_1on1;
    if (days == null || days <= thresholdDays) return null;

    return {
      kind: 'review_1on1_due',
      fires: true,
      severity: 'warning',
      value: days,
      baseline: thresholdDays,
      trend: null,
      label: 'Revisión 1:1 vencida',
      detail: `${days}d sin revisión · cadencia cada ${thresholdDays}d`,
      // Una revisión pendiente por atleta a la vez → sin sufijo.
      dedupe_key: dedupeKey('review_1on1_due', facts.athlete_id),
    };
  },
};
