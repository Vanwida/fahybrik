// Andamiaje compartido de los tests del motor de señales.
//
// Vive aparte porque lo usan dos suites (`evaluators.test.ts` y
// `communications.test.ts`) y un atleta base de sesenta campos copiado dos veces
// deja de ser un atleta sano en cuanto una de las copias se queda atrás. No es
// un fichero de test: el glob de vitest sólo recoge `*.test.ts`.

import { expect } from 'vitest';
import {
  type EffectiveThresholds,
  type SignalFacts,
  type SignalKind,
  type SignalResult,
} from '@fahybrid/shared/domain/coach/signals';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';
import { SIGNAL_EVALUATORS } from '../index';

/** «Ahora» fijo para que el cálculo de días, sincronizaciones y fechas no baile. */
export const NOW = new Date('2026-06-18T12:00:00.000Z');

export const ATHLETE_ID = 'ath_1';

/**
 * `EffectiveThresholds` es un registro numérico de sólo lectura; la config real
 * es un superconjunto de string→number, así que lo satisface estructuralmente.
 */
export const THRESHOLDS: EffectiveThresholds = SIGNAL_THRESHOLDS;

/** Todo a nulo/neutro: un atleta perfectamente sano, no dispara nada. */
export function baseFacts(overrides: Partial<SignalFacts> = {}): SignalFacts {
  return {
    athlete_id: ATHLETE_ID,
    coach_id: 'coach_1',
    full_name: 'Test Athlete',

    hrv_delta_ms: null,
    hrv_baseline_days: null,
    sync_minutes_ago: null,
    missed_sessions_7d: 0,
    rpe_yesterday: null,
    last_checkin_at: NOW, // reciente → checkin_skipped no dispara
    unread_message_age_min: null,
    readiness_score: null,

    discomfort_area: null,
    discomfort_at: null,
    discomfort_note: null,

    programming_status: 'ok',
    programming_label: null,
    programming_detail: null,
    current_microcycle_end_iso: null,
    current_block_type: null,
    transition_recommendation: null,
    transition_detail: null,
    days_to_a_event: null,
    a_event_name: null,

    intake_pending_hours: null,
    intake_a_event_name: null,
    intake_a_event_days: null,
    week_adjustment_proposal_id: null,
    week_adjustment_summary: null,
    monthly_block_proposal_id: null,
    monthly_block_month_name: null,

    billing_risk: null,
    billing_days_to_period_end: null,

    latest_test_at: null,
    latest_test_label: null,
    latest_test_is_pr: false,
    days_since_last_test: null,
    latest_race_completed_at: null,
    latest_race_name: null,
    latest_race_id: null,

    latest_libre_at: null,
    latest_libre_title: null,
    latest_libre_detail: null,

    // Revisiones 1:1 (#21): sin cadencia → review_1on1_due no dispara por defecto.
    review_cadence: 'ninguna',
    days_since_last_1on1: null,
    has_upcoming_review: false,

    // Comunicados: nada publicado le reclama nada.
    communication_question: null,
    communication_task: null,
    communication_protocol: null,

    ...overrides,
  };
}

/** Corre UN evaluador por tipo y devuelve su resultado (puede ser null). */
export function run(
  kind: SignalKind,
  facts: SignalFacts,
  thresholds: EffectiveThresholds = THRESHOLDS,
): SignalResult | null {
  return SIGNAL_EVALUATORS[kind].evaluate(facts, thresholds, NOW);
}

export function fired(
  kind: SignalKind,
  facts: SignalFacts,
  thresholds: EffectiveThresholds = THRESHOLDS,
): SignalResult {
  const r = run(kind, facts, thresholds);
  expect(r, `${kind} should have returned a result`).not.toBeNull();
  expect(r!.fires, `${kind} should fire`).toBe(true);
  return r!;
}

export function notFired(
  kind: SignalKind,
  facts: SignalFacts,
  thresholds: EffectiveThresholds = THRESHOLDS,
): void {
  const r = run(kind, facts, thresholds);
  // Vale tanto null como un resultado que no dispara.
  expect(r === null || r.fires === false, `${kind} should NOT fire`).toBe(true);
}
