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
import { READINESS_OK_MIN } from '@/lib/dashboard/constants/readiness';
import { SIGNAL_EVALUATORS, evaluateAll } from '../index';
// El atleta base y los dos ayudantes viven en ./facts porque los comparte la
// suite de comunicados: copiarlos sería tener dos atletas «sanos» distintos.
import { THRESHOLDS, NOW, ATHLETE_ID, baseFacts, fired, notFired } from './facts';

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
    expect(r.trend).toBe('down');
    expect(r.label).toBe('HRV crash');
    expect(r.detail).toBe('▼ 20 ms vs baseline');
  });

  it('does NOT fire with insufficient baseline (<14 days) — false-alert guard', () => {
    notFired('hrv_crash', baseFacts({ hrv_delta_ms: -20, hrv_baseline_days: 5 }));
  });

  it('does NOT fire when baseline_days is null', () => {
    notFired('hrv_crash', baseFacts({ hrv_delta_ms: -20, hrv_baseline_days: null }));
  });

  it('does NOT fire when delta is above threshold', () => {
    notFired('hrv_crash', baseFacts({ hrv_delta_ms: -3, hrv_baseline_days: 30 }));
  });

  it('does NOT fire when delta is null', () => {
    notFired('hrv_crash', baseFacts({ hrv_delta_ms: null, hrv_baseline_days: 30 }));
  });
});

describe('no_sync', () => {
  it('fires warning at 30h', () => {
    const r = fired('no_sync', baseFacts({ sync_minutes_ago: 30 * 60 }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(30 * 60);
    expect(r.label).toBe(`Sync >${SIGNAL_THRESHOLDS.no_sync_warning_hours}h`);
    expect(r.detail).toBe('comprobar wearable');
  });

  it('fires critical at 50h', () => {
    const r = fired('no_sync', baseFacts({ sync_minutes_ago: 50 * 60 }));
    expect(r.severity).toBe('critical');
    expect(r.detail).toBe('wearable offline');
    expect(r.label).toBe('2d sin sync');
  });

  it('does NOT fire at 10h', () => {
    notFired('no_sync', baseFacts({ sync_minutes_ago: 10 * 60 }));
  });

  it('does NOT fire when null', () => {
    notFired('no_sync', baseFacts({ sync_minutes_ago: null }));
  });
});

describe('readiness_low', () => {
  it('fires critical when score < caution band (45)', () => {
    const r = fired('readiness_low', baseFacts({ readiness_score: 30 }));
    expect(r.severity).toBe('critical');
    expect(r.value).toBe(30);
    expect(r.baseline).toBe(READINESS_OK_MIN);
    expect(r.label).toBe('Readiness 30%');
    expect(r.detail).toBe('en rojo');
  });

  it('fires warning when score in caution band (55)', () => {
    const r = fired('readiness_low', baseFacts({ readiness_score: 55 }));
    expect(r.severity).toBe('warning');
    expect(r.label).toBe('Readiness 55%');
    expect(r.detail).toBe('con cautela');
  });

  it('does NOT fire when score >= ok band (80)', () => {
    notFired('readiness_low', baseFacts({ readiness_score: 80 }));
  });

  it('does NOT fire when null', () => {
    notFired('readiness_low', baseFacts({ readiness_score: null }));
  });

  it('boundary: exactly OK_MIN does not fire, one below fires warning', () => {
    notFired('readiness_low', baseFacts({ readiness_score: READINESS_OK_MIN }));
    expect(fired('readiness_low', baseFacts({ readiness_score: READINESS_OK_MIN - 1 })).severity).toBe('warning');
  });
});

describe('missed_sessions', () => {
  it('fires at the minimum (2)', () => {
    const r = fired('missed_sessions', baseFacts({ missed_sessions_7d: 2 }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(2);
    expect(r.baseline).toBe(SIGNAL_THRESHOLDS.missed_sessions_min);
    expect(r.label).toBe('2 sesiones perdidas');
    expect(r.detail).toBe('última 7 días');
  });

  it('does NOT fire at 1', () => {
    notFired('missed_sessions', baseFacts({ missed_sessions_7d: 1 }));
  });
});

describe('rpe_high', () => {
  it('fires at 9', () => {
    const r = fired('rpe_high', baseFacts({ rpe_yesterday: 9 }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(9);
    expect(r.label).toBe('RPE 9.0 ayer');
    expect(r.detail).toBe('monitor sobreesfuerzo');
  });

  it('does NOT fire at 8', () => {
    notFired('rpe_high', baseFacts({ rpe_yesterday: 8 }));
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
    expect(r.detail).toBe('pinchazo bajando escaleras');
    expect(r.dedupe_key).toBe(`discomfort_reported:${ATHLETE_ID}`);
  });

  it('falls back to a default detail when there is no note', () => {
    const r = fired('discomfort_reported', baseFacts({ discomfort_area: 'otra', discomfort_at: NOW }));
    expect(r.label).toBe('Molestia · Otra zona');
    expect(r.detail).toBe('reportada en una sesión');
  });

  it('does NOT fire when the report is older than the window', () => {
    const old = new Date(NOW.getTime() - 20 * 86_400_000); // 20d ago > 10d threshold
    notFired('discomfort_reported', baseFacts({ discomfort_area: 'tobillo', discomfort_at: old }));
  });

  it('does NOT fire when there is no discomfort area', () => {
    notFired('discomfort_reported', baseFacts({ discomfort_area: null, discomfort_at: NOW }));
  });
});

describe('checkin_skipped', () => {
  it('fires when there is no check-in at all (null)', () => {
    const r = fired('checkin_skipped', baseFacts({ last_checkin_at: null }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBeNull(); // +Infinity age → not finite → null
    expect(r.label).toBe('Check-in 2d');
    expect(r.detail).toBe('sin daily');
  });

  it('fires when check-in is older than threshold', () => {
    const old = new Date(NOW.getTime() - 60 * 3_600_000); // 60h ago
    const r = fired('checkin_skipped', baseFacts({ last_checkin_at: old }));
    expect(r.value).toBe(60);
  });

  it('does NOT fire when check-in is recent', () => {
    notFired('checkin_skipped', baseFacts({ last_checkin_at: NOW }));
  });
});

describe('message_unanswered', () => {
  it('fires when older than threshold hours', () => {
    const r = fired('message_unanswered', baseFacts({ unread_message_age_min: 13 * 60 }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(13);
    expect(r.label).toBe('Mensaje 13h sin responder');
    expect(r.detail).toBe('inbox');
  });

  it('does NOT fire when within threshold', () => {
    notFired('message_unanswered', baseFacts({ unread_message_age_min: 5 * 60 }));
  });
});

describe('transition_ready', () => {
  it("fires when recommendation === 'advance'", () => {
    const r = fired('transition_ready', baseFacts({ transition_recommendation: 'advance', transition_detail: 'TSB recuperado' }));
    expect(r.severity).toBe('warning');
    expect(r.label).toBe('Listo para el siguiente ciclo');
    expect(r.detail).toBe('TSB recuperado');
    expect(r.value).toBeNull();
  });

  it("falls back to default detail when none provided", () => {
    const r = fired('transition_ready', baseFacts({ transition_recommendation: 'advance' }));
    expect(r.detail).toBe('Revisar deep-dive');
  });

  it("does NOT fire on 'hold'", () => {
    notFired('transition_ready', baseFacts({ transition_recommendation: 'hold' }));
  });
});

describe('programming_status', () => {
  it("fires warning on 'month_2_pending' (propuesta, no bloque seco)", () => {
    const r = fired('programming_status', baseFacts({ programming_status: 'month_2_pending', programming_label: 'Propuesta de mes pendiente', programming_detail: 'Hay un bloque mensual por validar' }));
    expect(r.severity).toBe('warning');
    expect(r.label).toBe('Propuesta de mes pendiente');
    expect(r.detail).toBe('Hay un bloque mensual por validar');
  });

  it("fires critical on 'block_ended'", () => {
    const r = fired('programming_status', baseFacts({ programming_status: 'block_ended', programming_label: 'Bloque terminado', programming_detail: 'Sin siguiente bloque' }));
    expect(r.severity).toBe('critical');
    expect(r.label).toBe('Bloque terminado');
    expect(r.detail).toBe('Sin siguiente bloque');
  });

  it("fires warning on 'no_month'", () => {
    const r = fired('programming_status', baseFacts({ programming_status: 'no_month' }));
    expect(r.severity).toBe('warning');
    expect(r.label).toBe('Programación pendiente');
  });

  it("does NOT fire on 'ok'", () => {
    notFired('programming_status', baseFacts({ programming_status: 'ok' }));
  });
});

describe('microcycle_ending', () => {
  function isoInDays(d: number): string {
    const t = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() + d));
    return t.toISOString().slice(0, 10);
  }

  it('fires when ending in 3 days', () => {
    const r = fired('microcycle_ending', baseFacts({ current_microcycle_end_iso: isoInDays(3), current_block_type: 'Base aeróbica' }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(3);
    expect(r.label).toBe('Ciclo acaba en 3d');
    expect(r.detail).toBe('Ahora: Base aeróbica · asigna el siguiente');
  });

  it('uses default detail when no block type', () => {
    const r = fired('microcycle_ending', baseFacts({ current_microcycle_end_iso: isoInDays(1) }));
    expect(r.detail).toBe('Asigna el siguiente ciclo');
  });

  it('does NOT fire when ending in 20 days', () => {
    notFired('microcycle_ending', baseFacts({ current_microcycle_end_iso: isoInDays(20) }));
  });

  it('does NOT fire when already past (-1)', () => {
    notFired('microcycle_ending', baseFacts({ current_microcycle_end_iso: isoInDays(-1) }));
  });

  it('does NOT fire when null', () => {
    notFired('microcycle_ending', baseFacts({ current_microcycle_end_iso: null }));
  });
});

describe('a_event_near', () => {
  it('fires when within window (10 days)', () => {
    const r = fired('a_event_near', baseFacts({ days_to_a_event: 10, a_event_name: 'HYROX BCN' }));
    expect(r.severity).toBe('warning');
    expect(r.value).toBe(10);
    expect(r.label).toBe('HYROX BCN · 10d');
    expect(r.detail).toBe('carrera objetivo cerca');
  });

  it('uses default label without event name', () => {
    const r = fired('a_event_near', baseFacts({ days_to_a_event: 5 }));
    expect(r.label).toBe('Evento A en 5d');
  });

  it('does NOT fire at 40 days', () => {
    notFired('a_event_near', baseFacts({ days_to_a_event: 40 }));
  });

  it('does NOT fire when null', () => {
    notFired('a_event_near', baseFacts({ days_to_a_event: null }));
  });
});

describe('intake_pending', () => {
  it('fires critical at 60h with day label', () => {
    const r = fired('intake_pending', baseFacts({ intake_pending_hours: 60 }));
    expect(r.severity).toBe('critical');
    expect(r.value).toBe(60);
    expect(r.label).toBe('Intake 2d');
    expect(r.detail).toBe('sin plan tras onboarding');
    expect(r.dedupe_key).toBe(`intake_pending:${ATHLETE_ID}`);
  });

  it('fires warning at 10h with event detail', () => {
    const r = fired('intake_pending', baseFacts({ intake_pending_hours: 10, intake_a_event_name: 'HYROX', intake_a_event_days: 40 }));
    expect(r.severity).toBe('warning');
    expect(r.label).toBe('Intake pendiente');
    expect(r.detail).toBe('HYROX · 40d');
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
    expect(r.label).toBe('Ajuste semanal IA');
    expect(r.detail).toBe('−1 sesión');
    expect(r.dedupe_key).toBe(`week_adjustment_pending:${ATHLETE_ID}:prop_42`);
  });

  it('uses default detail when no summary', () => {
    const r = fired('week_adjustment_pending', baseFacts({ week_adjustment_proposal_id: 'prop_1' }));
    expect(r.detail).toBe('Propuesta pendiente de revisión');
  });

  it('does NOT fire when null', () => {
    notFired('week_adjustment_pending', baseFacts({ week_adjustment_proposal_id: null }));
  });
});

describe('monthly_block_pending', () => {
  it('fires with proposal id in dedupe key', () => {
    const r = fired('monthly_block_pending', baseFacts({ monthly_block_proposal_id: 'mb_7', monthly_block_month_name: 'Julio' }));
    expect(r.severity).toBe('warning');
    expect(r.label).toBe('Bloque mensual');
    expect(r.detail).toBe('Julio pendiente');
    expect(r.dedupe_key).toBe(`monthly_block_pending:${ATHLETE_ID}:mb_7`);
  });

  it('uses default detail when no month name', () => {
    const r = fired('monthly_block_pending', baseFacts({ monthly_block_proposal_id: 'mb_1' }));
    expect(r.detail).toBe('Propuesta de bloque pendiente');
  });

  it('does NOT fire when null', () => {
    notFired('monthly_block_pending', baseFacts({ monthly_block_proposal_id: null }));
  });
});

describe('workout_libre', () => {
  it('fires warning when a self-origin session is within the window (today)', () => {
    const r = fired(
      'workout_libre',
      baseFacts({
        latest_libre_at: NOW,
        latest_libre_title: 'Remo 5×500',
        latest_libre_detail: 'Remo 5×500 · no prescrito · suma al plan',
      }),
    );
    expect(r.severity).toBe('warning');
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
    expect(r.label).toBe('Pago fallido');
    expect(r.detail).toBe('suscripción vencida');
    expect(r.value).toBeNull();
  });

  it("fires warning on 'renewal_soon' with days", () => {
    const r = fired('billing_at_risk', baseFacts({ billing_risk: 'renewal_soon', billing_days_to_period_end: 5 }));
    expect(r.severity).toBe('warning');
    expect(r.label).toBe('Renovación próxima');
    expect(r.detail).toBe('vence en 5d');
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
      readiness_score: 30,
      billing_risk: 'past_due',
    });
    const results = evaluateAll(facts, THRESHOLDS, NOW);
    const kinds = results.map((r) => r.kind).sort();
    expect(kinds).toEqual(['billing_at_risk', 'hrv_crash', 'readiness_low']);
    expect(results.every((r) => r.fires)).toBe(true);
  });
});
