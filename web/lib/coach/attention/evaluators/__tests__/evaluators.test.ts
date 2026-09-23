// Pure-signal-evaluator unit tests (HOY attention engine, Phase F1).
//
// These run the REAL `SIGNAL_THRESHOLDS` and `readiness` bands against the
// registry of evaluators. No DB, no mocks — the whole point of the pure layer
// is that it is testable against Pablo's real cohort thresholds in isolation.

import { describe, it, expect } from 'vitest';
import {
  SIGNAL_KINDS,
  FLAGGED_OFF_SIGNAL_KINDS,
} from '@fahybrid/shared/domain/coach/signals';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';
import { SIGNAL_EVALUATORS, evaluateAll } from '../index';
// El atleta base y los dos ayudantes viven en ./facts porque los comparte la
// suite de comunicados: copiarlos sería tener dos atletas «sanos» distintos.
import {
  THRESHOLDS,
  NOW,
  ATHLETE_ID,
  TODAY,
  dayOffset,
  baseFacts,
  fired,
  notFired,
} from './facts';

/** Una serie diaria de readiness: `days` lecturas terminando en `endOffset`. */
function series(values: number[], endOffset = 0): Array<{ on: string; score: number }> {
  return values.map((score, i) => ({ on: dayOffset(endOffset - (values.length - 1 - i)), score }));
}

describe('evaluateAll — healthy athlete', () => {
  it('returns [] when everything is neutral (auto-resolve)', () => {
    expect(evaluateAll(baseFacts(), THRESHOLDS, NOW)).toEqual([]);
  });
});

describe('hrv_crash', () => {
  it('fires critical when delta <= threshold AND baseline >= 14 days', () => {
    const r = fired('hrv_crash', baseFacts({ hrv_delta_ms: -20, hrv_baseline_days: 30 }));
    expect(r.severity).toBe('critical');
    expect(r.value).toBe(-20);
    expect(r.baseline).toBe(0);
    expect(r.label).toBe('HRV −20 ms');
    expect(r.detail).toBe('media de 7 d vs su base de 60 d');
  });

  it('does NOT fire with insufficient baseline (<14 days) — false-alert guard', () => {
    notFired('hrv_crash', baseFacts({ hrv_delta_ms: -20, hrv_baseline_days: 10 }));
  });

  it('does NOT fire when baseline_days is null', () => {
    notFired('hrv_crash', baseFacts({ hrv_delta_ms: -20, hrv_baseline_days: null }));
  });

  it('does NOT fire when delta is above threshold', () => {
    notFired('hrv_crash', baseFacts({ hrv_delta_ms: -5, hrv_baseline_days: 30 }));
  });

  it('does NOT fire when delta is null', () => {
    notFired('hrv_crash', baseFacts({ hrv_delta_ms: null, hrv_baseline_days: 30 }));
  });
});

describe('no_sync', () => {
  it('is informative (not in the daily queue) between the two thresholds (30h)', () => {
    const r = fired('no_sync', baseFacts({ sync_minutes_ago: 30 * 60 }));
    expect(r.severity).toBe('info');
    expect(r.value).toBe(30 * 60);
    expect(r.label).toBe('Reloj sin sincronizar · 1 d');
  });

  it('is a warning — never critical — past the long threshold (50h)', () => {
    const r = fired('no_sync', baseFacts({ sync_minutes_ago: 50 * 60 }));
    expect(r.severity).toBe('warning');
    expect(r.label).toBe('Reloj sin sincronizar · 2 d');
    expect(r.detail).toBe('último dato, 16 jun');
  });

  it('does NOT fire at 10h', () => {
    notFired('no_sync', baseFacts({ sync_minutes_ago: 10 * 60 }));
  });

  it('does NOT fire when null', () => {
    notFired('no_sync', baseFacts({ sync_minutes_ago: null }));
  });
});

describe('readiness_low — vs su base propia, persistencia y frescura', () => {
  // 20 días estables en 70 (base = 70) y luego lo que diga cada caso.
  const stable = Array.from({ length: 20 }, () => 70);

  it('CRÍTICO con una sola lectura bajo el suelo (40), con base', () => {
    const r = fired('readiness_low', baseFacts({ readiness_series: series([...stable, 31]) }));
    expect(r.severity).toBe('critical');
    expect(r.value).toBe(31);
    expect(r.baseline).toBe(70);
    expect(r.label).toBe('Readiness baja');
    expect(r.detail).toBe('31 hoy · −39 vs su base 70 (28 d) · bajo tu suelo de 40');
    expect(r.window_label).toBe('28 d');
    expect(r.dedupe_key).toBe(`readiness_low:${ATHLETE_ID}:${TODAY}`);
  });

  it('SIN base, bajo el suelo es VIGILAR como mucho — nunca crítico (y lo dice)', () => {
    const r = fired('readiness_low', baseFacts({ readiness_series: series([38]) }));
    expect(r.severity).toBe('warning');
    expect(r.baseline).toBeNull();
    expect(r.detail).toBe('38 hoy · aún sin su base (0 de 7 lecturas) · bajo tu suelo de 40');
  });

  it('SIN base con 3 lecturas previas: dice cuántas lleva de las 7', () => {
    const r = fired('readiness_low', baseFacts({ readiness_series: series([70, 68, 72, 35]) }));
    expect(r.severity).toBe('warning');
    expect(r.detail).toBe('35 hoy · aún sin su base (3 de 7 lecturas) · bajo tu suelo de 40');
  });

  it('con 7 lecturas previas ya hay base y el suelo vuelve a ser crítico', () => {
    const r = fired('readiness_low', baseFacts({ readiness_series: series([70, 70, 70, 70, 70, 70, 70, 35]) }));
    expect(r.severity).toBe('critical');
    expect(r.baseline).toBe(70);
  });

  it('VIGILAR: 15+ bajo su base 3 días seguidos', () => {
    const r = fired('readiness_low', baseFacts({ readiness_series: series([...stable, 52, 54, 50]) }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(50);
    expect(r.baseline).toBe(70);
    expect(r.detail).toBe('50 hoy · −20 vs su base 70 (28 d) · 3 días seguidos');
    // El episodio empieza el primer día de la racha.
    expect(r.dedupe_key).toBe(`readiness_low:${ATHLETE_ID}:${dayOffset(-2)}`);
  });

  it('no dispara con solo 2 días bajo su base (persistencia)', () => {
    notFired('readiness_low', baseFacts({ readiness_series: series([...stable, 70, 52, 50]) }));
  });

  it('un día sin lectura corta la racha', () => {
    const s = [...series(stable, -4), { on: dayOffset(-3), score: 50 }, { on: dayOffset(-1), score: 50 }, { on: TODAY, score: 50 }];
    notFired('readiness_low', baseFacts({ readiness_series: s }));
  });

  it('un 44 en alguien cuya base es 46 NO es señal (su normal)', () => {
    const low = Array.from({ length: 20 }, () => 46);
    notFired('readiness_low', baseFacts({ readiness_series: series([...low, 44, 43, 44]) }));
  });

  it('una lectura vieja (más de 2 días) no dispara aunque sea bajísima', () => {
    notFired('readiness_low', baseFacts({ readiness_series: series([...stable, 20], -3) }));
  });

  it('sin lecturas no dispara', () => {
    notFired('readiness_low', baseFacts({ readiness_series: [] }));
  });

  it('usa los umbrales del coach (suelo 30 → un 35 ya no es crítico)', () => {
    notFired('readiness_low', baseFacts({ readiness_series: series([35]) }), {
      ...THRESHOLDS,
      readiness_critical_floor: 30,
    });
  });
});

describe('missed_sessions — solo lo debido', () => {
  it('fires at the minimum (2) with due and last date', () => {
    const r = fired(
      'missed_sessions',
      baseFacts({ missed_sessions_7d: 2, due_sessions_7d: 4, last_missed_on: dayOffset(-1) }),
    );
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(2);
    expect(r.baseline).toBe(4);
    expect(r.label).toBe('2 de 4 debidas sin hacer');
    expect(r.detail).toBe('últimos 7 d · el último, ayer');
    expect(r.window_label).toBe('7 d');
  });

  it('does NOT fire at 1', () => {
    notFired('missed_sessions', baseFacts({ missed_sessions_7d: 1, due_sessions_7d: 3 }));
  });

  it('respeta el mínimo del coach', () => {
    notFired('missed_sessions', baseFacts({ missed_sessions_7d: 2, due_sessions_7d: 4 }), {
      ...THRESHOLDS,
      missed_sessions_min: 3,
    });
  });

  it('pide también una parte de lo debido: 2 de 10 es una semana normal', () => {
    notFired('missed_sessions', baseFacts({ missed_sessions_7d: 2, due_sessions_7d: 10 }));
    fired('missed_sessions', baseFacts({ missed_sessions_7d: 3, due_sessions_7d: 10 }));
  });

  it('con la proporción a 0 basta el número', () => {
    fired('missed_sessions', baseFacts({ missed_sessions_7d: 2, due_sessions_7d: 10 }), {
      ...THRESHOLDS,
      missed_sessions_share_pct: 0,
    });
  });
});

describe('rpe_high — una tendencia de la semana, no un día duro', () => {
  const rpe = (...v: Array<number | null>) => v.map((x, i) => ({ on: dayOffset(-v.length + 1 + i), rpe: x }));

  it('fires when half or more of the week is at RPE ≥ 9 (min 2)', () => {
    const r = fired('rpe_high', baseFacts({ sessions_7d_rpe: rpe(9, 7, 9, 10) }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(3);
    expect(r.baseline).toBe(4);
    expect(r.label).toBe('RPE alto en 3 de 4 entrenos');
    expect(r.detail).toBe('RPE 9 o más · últimos 7 d · el último, hoy');
  });

  it('does NOT fire with one hard session (a hard day is the plan working)', () => {
    notFired('rpe_high', baseFacts({ sessions_7d_rpe: rpe(9) }));
  });

  it('does NOT fire when hard sessions are under half the week', () => {
    notFired('rpe_high', baseFacts({ sessions_7d_rpe: rpe(9, 6, 7, 9, 6) }));
  });

  it('ignora entrenos sin RPE registrado en el denominador', () => {
    fired('rpe_high', baseFacts({ sessions_7d_rpe: rpe(9, null, 9, null, 7) }));
  });
});

describe('discomfort_reported', () => {
  it('fires warning for a recent report, area in label + note in detail', () => {
    const at = new Date(NOW.getTime() - 2 * 86_400_000); // 2d ago
    const r = fired('discomfort_reported', baseFacts({
      discomfort_area: 'rodilla',
      discomfort_at: at,
      discomfort_note: 'pinchazo bajando escaleras',
    }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(2);
    expect(r.baseline).toBe(SIGNAL_THRESHOLDS.discomfort_recent_days);
    expect(r.label).toBe('Molestia · Rodilla');
    expect(r.detail).toBe('pinchazo bajando escaleras · 16 jun');
    expect(r.dedupe_key).toBe(`discomfort_reported:${ATHLETE_ID}`);
  });

  it('falls back to a default detail when there is no note', () => {
    const r = fired('discomfort_reported', baseFacts({ discomfort_area: 'otra', discomfort_at: NOW }));
    expect(r.label).toBe('Molestia · Otra zona');
    expect(r.detail).toBe('reportada en una sesión · hoy');
  });

  it('does NOT fire when the report is older than the window', () => {
    const old = new Date(NOW.getTime() - 20 * 86_400_000); // 20d ago > 10d threshold
    notFired('discomfort_reported', baseFacts({ discomfort_area: 'tobillo', discomfort_at: old }));
  });

  it('does NOT fire when there is no discomfort area', () => {
    notFired('discomfort_reported', baseFacts({ discomfort_area: null, discomfort_at: NOW }));
  });
});

describe('checkin_skipped — solo a quien tiene el hábito', () => {
  it('does NOT fire for an athlete who never checks in', () => {
    notFired('checkin_skipped', baseFacts({ last_checkin_at: null, checkins_prior_14d: 0 }));
  });

  it('does NOT fire without the habit (K of 14)', () => {
    const old = new Date(NOW.getTime() - 3 * 86_400_000);
    notFired('checkin_skipped', baseFacts({ last_checkin_at: old, checkins_prior_14d: 4 }));
  });

  it('fires when the habit breaks for 2+ days', () => {
    const old = new Date(NOW.getTime() - 3 * 86_400_000);
    const r = fired('checkin_skipped', baseFacts({ last_checkin_at: old, checkins_prior_14d: 12 }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(3);
    expect(r.label).toBe('Sin check-in · 3 d');
    expect(r.detail).toBe('hacía 12 de 14 días · el último, 15 jun');
  });

  it('does NOT fire when check-in is recent', () => {
    notFired('checkin_skipped', baseFacts({ last_checkin_at: NOW, checkins_prior_14d: 14 }));
  });

  it('se retira sola pasadas dos semanas de silencio', () => {
    const old = new Date(NOW.getTime() - 20 * 86_400_000);
    notFired('checkin_skipped', baseFacts({ last_checkin_at: old, checkins_prior_14d: 14 }));
  });
});

describe('message_unanswered — el último mensaje es del atleta', () => {
  it('fires when waiting longer than the threshold', () => {
    const last = new Date(NOW.getTime() - 2 * 3_600_000);
    const r = fired(
      'message_unanswered',
      baseFacts({ unread_message_age_min: 13 * 60, awaiting_reply_count: 2, awaiting_reply_last_at: last }),
    );
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(13);
    expect(r.label).toBe('Por responder');
    expect(r.detail).toBe('espera 13 h · 2 mensajes');
    // Si vuelve a escribir tras un «hecho», es otra espera.
    expect(r.dedupe_key).toBe(`message_unanswered:${ATHLETE_ID}:${last.toISOString()}`);
  });

  it('does NOT fire when within threshold', () => {
    notFired('message_unanswered', baseFacts({ unread_message_age_min: 5 * 60, awaiting_reply_count: 1 }));
  });
});

describe('transition_ready — informativa, fuera de la bandeja diaria', () => {
  it("fires as INFO when recommendation === 'advance'", () => {
    const r = fired('transition_ready', baseFacts({ transition_recommendation: 'advance', transition_detail: 'TSB recuperado' }));
    expect(r.severity).toBe('info');
    expect(r.label).toBe('Listo para progresar');
    expect(r.detail).toBe('TSB recuperado');
    expect(r.value).toBeNull();
  });

  it("does NOT fire on 'hold'", () => {
    notFired('transition_ready', baseFacts({ transition_recommendation: 'hold' }));
  });
});

describe('programming_status — solo los huecos del plan', () => {
  it("does NOT fire on proposals (they have their own signal)", () => {
    notFired('programming_status', baseFacts({ programming_status: 'month_2_pending' }));
    notFired('programming_status', baseFacts({ programming_status: 'pending_proposal' }));
  });

  it("fires on 'block_ended' with the end date", () => {
    const r = fired('programming_status', baseFacts({ programming_status: 'block_ended', last_program_end_iso: '2026-06-14' }));
    expect(r.severity).toBe('warning');
    expect(r.label).toBe('Programa terminado');
    expect(r.detail).toBe('terminó el 14 jun · sin siguiente');
    expect(r.dedupe_key).toBe(`programming_status:${ATHLETE_ID}:block_ended`);
  });

  it("fires on 'no_month'", () => {
    const r = fired('programming_status', baseFacts({ programming_status: 'no_month' }));
    expect(r.label).toBe('Sin programa');
  });

  it("fires on 'empty_week' citing the next start", () => {
    const r = fired('programming_status', baseFacts({ programming_status: 'empty_week', next_program_start_iso: '2026-06-22' }));
    expect(r.label).toBe('Semana vacía');
    expect(r.detail).toBe('su programa empieza el 22 jun');
  });

  it("does NOT fire on 'ok'", () => {
    notFired('programming_status', baseFacts({ programming_status: 'ok' }));
  });
});

describe('microcycle_ending — acaba y no tiene siguiente', () => {
  it('fires when ending in 3 days with nothing next', () => {
    const r = fired('microcycle_ending', baseFacts({ current_microcycle_end_iso: dayOffset(3), current_block_type: 'Base aeróbica' }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(3);
    expect(r.label).toBe('Su programa acaba en 3 días');
    expect(r.detail).toBe('Base aeróbica · termina el 21 jun · sin siguiente');
  });

  it('does NOT fire when the next programa is already assigned', () => {
    notFired('microcycle_ending', baseFacts({ current_microcycle_end_iso: dayOffset(3), next_program_start_iso: dayOffset(4) }));
  });

  it('does NOT fire when ending in 20 days', () => {
    notFired('microcycle_ending', baseFacts({ current_microcycle_end_iso: dayOffset(20) }));
  });

  it('does NOT fire when already past (-1)', () => {
    notFired('microcycle_ending', baseFacts({ current_microcycle_end_iso: dayOffset(-1) }));
  });

  it('does NOT fire when null', () => {
    notFired('microcycle_ending', baseFacts({ current_microcycle_end_iso: null }));
  });
});

describe('a_event_near — contexto (info)', () => {
  it('fires as info when within window (10 days)', () => {
    const r = fired('a_event_near', baseFacts({ days_to_a_event: 10, a_event_name: 'HYROX BCN' }));
    expect(r.severity).toBe('info');
    expect(r.value).toBe(10);
    expect(r.label).toBe('HYROX BCN · 10 d');
  });

  it('uses default label without event name', () => {
    const r = fired('a_event_near', baseFacts({ days_to_a_event: 5 }));
    expect(r.label).toBe('Carrera objetivo en 5 d');
  });

  it('does NOT fire at 40 days', () => {
    notFired('a_event_near', baseFacts({ days_to_a_event: 40 }));
  });

  it('does NOT fire when null', () => {
    notFired('a_event_near', baseFacts({ days_to_a_event: null }));
  });
});

describe('intake_pending', () => {
  it('fires critical at 60h', () => {
    const r = fired('intake_pending', baseFacts({ intake_pending_hours: 60 }));
    expect(r.severity).toBe('critical');
    expect(r.value).toBe(60);
    expect(r.label).toBe('Alta pendiente');
    expect(r.detail).toBe('terminó el cuestionario hace 2 d');
    expect(r.dedupe_key).toBe(`intake_pending:${ATHLETE_ID}`);
  });

  it('fires warning at 10h with event detail', () => {
    const r = fired('intake_pending', baseFacts({ intake_pending_hours: 10, intake_a_event_name: 'HYROX', intake_a_event_days: 40 }));
    expect(r.severity).toBe('warning');
    expect(r.detail).toBe('terminó el cuestionario hace 10 h · HYROX en 40 d');
  });

  it('does NOT fire when null', () => {
    notFired('intake_pending', baseFacts({ intake_pending_hours: null }));
  });
});

describe('week_adjustment_pending', () => {
  it('fires with proposal id in dedupe key', () => {
    const r = fired('week_adjustment_pending', baseFacts({ week_adjustment_proposal_id: 'prop_42', week_adjustment_summary: '−1 sesión' }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBeNull();
    expect(r.label).toBe('Ajuste de semana propuesto');
    expect(r.detail).toBe('−1 sesión');
    expect(r.dedupe_key).toBe(`week_adjustment_pending:${ATHLETE_ID}:prop_42`);
  });

  it('uses default detail when no summary', () => {
    const r = fired('week_adjustment_pending', baseFacts({ week_adjustment_proposal_id: 'prop_1' }));
    expect(r.detail).toBe('pendiente de revisar');
  });

  it('does NOT fire when null', () => {
    notFired('week_adjustment_pending', baseFacts({ week_adjustment_proposal_id: null }));
  });
});

describe('monthly_block_pending', () => {
  it('fires with proposal id in dedupe key', () => {
    const r = fired('monthly_block_pending', baseFacts({ monthly_block_proposal_id: 'mb_7', monthly_block_month_name: 'Julio' }));
    expect(r.severity).toBe('warning');
    expect(r.label).toBe('Programa propuesto');
    expect(r.detail).toBe('Julio · pendiente de validar');
    expect(r.dedupe_key).toBe(`monthly_block_pending:${ATHLETE_ID}:mb_7`);
  });

  it('uses default detail when no month name', () => {
    const r = fired('monthly_block_pending', baseFacts({ monthly_block_proposal_id: 'mb_1' }));
    expect(r.detail).toBe('pendiente de validar');
  });

  it('does NOT fire when null', () => {
    notFired('monthly_block_pending', baseFacts({ monthly_block_proposal_id: null }));
  });
});

describe('workout_libre', () => {
  it('fires as info when a self-origin session is within the window (today)', () => {
    const r = fired(
      'workout_libre',
      baseFacts({
        latest_libre_at: NOW,
        latest_libre_title: 'Remo 5×500',
        latest_libre_detail: 'Remo 5×500 · no prescrito · suma al plan',
      }),
    );
    expect(r.severity).toBe('info');
    expect(r.value).toBe(0);
    expect(r.baseline).toBe(SIGNAL_THRESHOLDS.workout_libre_recent_days);
    expect(r.label).toBe('Entreno libre');
    expect(r.detail).toBe('Remo 5×500 · no prescrito · suma al plan');
    expect(r.dedupe_key).toBe(`workout_libre:${ATHLETE_ID}:${NOW.toISOString().slice(0, 10)}`);
  });

  it('falls back to default detail when none provided', () => {
    const r = fired('workout_libre', baseFacts({ latest_libre_at: NOW }));
    expect(r.detail).toBe('Entreno libre · no prescrito');
  });

  it('does NOT fire when older than the window', () => {
    const old = new Date(NOW.getTime() - 10 * 86_400_000); // 10d ago
    notFired('workout_libre', baseFacts({ latest_libre_at: old }));
  });

  it('does NOT fire when null', () => {
    notFired('workout_libre', baseFacts({ latest_libre_at: null }));
  });
});

describe('billing_at_risk', () => {
  it("fires critical on 'past_due'", () => {
    const r = fired('billing_at_risk', baseFacts({ billing_risk: 'past_due' }));
    expect(r.severity).toBe('critical');
    expect(r.label).toBe('Pago vencido');
    expect(r.detail).toBe('la suscripción está impagada');
    expect(r.value).toBeNull();
  });

  it("is informative on 'renewal_soon' (cancels at period end)", () => {
    const r = fired('billing_at_risk', baseFacts({ billing_risk: 'renewal_soon', billing_days_to_period_end: 5 }));
    expect(r.severity).toBe('info');
    expect(r.label).toBe('Cancela la suscripción');
    expect(r.detail).toBe('termina en 5 d');
    expect(r.value).toBe(5);
  });

  it('does NOT fire when null', () => {
    notFired('billing_at_risk', baseFacts({ billing_risk: null }));
  });
});

describe('registry exhaustiveness', () => {
  it('has an entry for every SIGNAL_KINDS member', () => {
    for (const kind of SIGNAL_KINDS) {
      expect(SIGNAL_EVALUATORS[kind], `missing evaluator for ${kind}`).toBeDefined();
      expect(SIGNAL_EVALUATORS[kind].kind).toBe(kind);
    }
  });

  it('has exactly the SIGNAL_KINDS keys, no extras', () => {
    expect(Object.keys(SIGNAL_EVALUATORS).sort()).toEqual([...SIGNAL_KINDS].sort());
  });
});

describe('flagged-off kinds emit nothing', () => {
  // Rich facts that WOULD trip these signals if they were backed/enabled.
  const richFacts = baseFacts({
    hrv_delta_ms: -50,
    hrv_baseline_days: 60,
    readiness_score: 10,
    missed_sessions_7d: 10,
    last_checkin_at: null,
  });

  for (const kind of FLAGGED_OFF_SIGNAL_KINDS) {
    it(`${kind} is disabled and never fires`, () => {
      expect(SIGNAL_EVALUATORS[kind].enabled).toBe(false);
      notFired(kind, richFacts);
    });
  }

  it('evaluateAll never includes flagged-off kinds', () => {
    const results = evaluateAll(richFacts, THRESHOLDS, NOW);
    const kinds = results.map((r) => r.kind);
    for (const off of FLAGGED_OFF_SIGNAL_KINDS) {
      expect(kinds).not.toContain(off);
    }
  });
});

describe('evaluateAll — multiple firing signals', () => {
  it('returns only firing results', () => {
    const facts = baseFacts({
      hrv_delta_ms: -20,
      hrv_baseline_days: 30,
      readiness_series: [{ on: TODAY, score: 30 }],
      billing_risk: 'past_due',
    });
    const results = evaluateAll(facts, THRESHOLDS, NOW);
    const kinds = results.map((r) => r.kind).sort();
    expect(kinds).toEqual(['billing_at_risk', 'hrv_crash', 'readiness_low']);
    expect(results.every((r) => r.fires)).toBe(true);
  });
});
