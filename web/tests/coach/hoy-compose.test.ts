// Hoy — la composición pura (web/lib/dashboard/hoy/hoy-compose). Grupos de
// causa compartida primero, una fila por atleta, lo cubierto por un grupo no se
// repite, peor primero, las informativas fuera (plan §4.3, informe B).

import { describe, expect, it } from 'vitest';
import { composeHoy, type HoyComposeInput } from '@/lib/dashboard/hoy/hoy-compose';
import type { AthletePlanFacts } from '@/lib/dashboard/athletes/plan-facts';
import type { AthleteSignalsRead } from '@/lib/coach/attention/signals-read';
import type { AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';

const NOW = new Date('2026-09-23T10:00:00.000Z'); // miércoles
const CAL = { today: '2026-09-23', week_start: '2026-09-21', week_end: '2026-09-27', next_week_start: '2026-09-28' };

function facts(id: string, p: Partial<AthletePlanFacts> = {}): AthletePlanFacts {
  return {
    athlete_id: id,
    name: `Atleta ${id}`,
    avatar_url: null,
    email: null,
    timezone: null,
    level: { id: '3', label: 'N3', title: null },
    lifecycle: 'activo',
    pause_reason: null,
    intake_pending: false,
    not_onboarded: false,
    onboarded_at: '2026-09-01T10:00:00.000Z',
    programming: { athlete_id: id, status: 'ok', label: 'Plan OK', detail: null, cta: null, cta_label: null },
    plan: 'con_programa',
    last_program_end: null,
    current_program: null,
    next_program_start: null,
    week_chip: { kind: 'visible', label: 'Visible' },
    week_held: false,
    next_week_hidden: false,
    next_week_held: false,
    next_week_sessions: 0,
    ...p,
  };
}

function sig(p: Partial<AthleteSignal> & Pick<AthleteSignal, 'kind' | 'severity'>): AthleteSignal {
  return {
    label: p.kind,
    evidence: '',
    value: null,
    baseline: null,
    window_label: null,
    observed_at: null,
    action: 'abrir_ficha',
    lens: 'plan',
    first_seen_at: '2026-09-23T08:00:00.000Z',
    dedupe_key: `${p.kind}:x`,
    ...p,
  };
}

function live(...s: AthleteSignal[]): AthleteSignalsRead {
  return { live: s, silenced: [], snoozed_until: null };
}

function input(p: Partial<HoyComposeInput>): HoyComposeInput {
  return {
    now: NOW,
    calendar: CAL,
    auto_publish_days: 2,
    facts: [],
    signals: new Map(),
    resolved_today: 0,
    negocio: null,
    ...p,
  };
}

describe('composeHoy — grupos', () => {
  it('semana oculta, sin programa, altas y pagos son UNA fila cada uno', () => {
    const view = composeHoy(
      input({
        facts: [
          facts('1', { week_chip: { kind: 'no_lo_ve', label: 'No lo ve' }, week_held: true }),
          facts('2', { week_chip: { kind: 'no_lo_ve', label: 'No lo ve' } }),
          facts('3', { plan: 'sin_programa', week_chip: { kind: 'sin_plan', label: 'Sin plan' } }),
          facts('4', { plan: 'terminado', week_chip: { kind: 'bloque_terminado', label: 'Bloque terminado' } }),
          // Alta pendiente sin programa: va a altas, NO a «sin programa».
          facts('5', { plan: 'sin_programa', intake_pending: true, onboarded_at: '2026-09-20T10:00:00Z' }),
          facts('6'),
          // Invitado sin cuestionario: todavía no pide nada.
          facts('7', { plan: 'sin_programa', not_onboarded: true, onboarded_at: null, week_chip: { kind: 'sin_plan', label: 'Sin plan' } }),
        ],
        signals: new Map([['6', live(sig({ kind: 'billing_at_risk', severity: 'critical' }))]]),
      }),
    );
    expect(view.systemic.map((g) => [g.kind, g.count])).toEqual([
      ['week_hidden', 2],
      ['no_program', 2],
      ['intake_pending', 1],
      ['payments_overdue', 1],
    ]);
    expect(view.systemic[0]).toMatchObject({
      title: '2 atletas no ven su semana',
      detail: 'la semana del 21 al 27 sept está oculta · 1 retenida por ti',
      week_start: '2026-09-21',
    });
    expect(view.systemic[1]!.detail).toBe('1 nunca ha tenido · 1 con el programa terminado');
    expect(view.systemic[2]).toMatchObject({ athlete_ids: ['5'], detail: 'la más antigua, hace 3 d' });
    // El pago vencido no se repite como fila.
    expect(view.critico).toEqual([]);
    expect(view.counts.needs_you).toBe(4);
    expect(view.week_visibility).toEqual({ visible: 2, total: 7 });
  });

  it('la semana que viene solo es grupo cuando, por la regla del coach, ya debería verse', () => {
    const f = [facts('1', { next_week_hidden: true, next_week_sessions: 4 })];
    // Miércoles con N = 2 → se abre el sábado: todavía no es un problema.
    expect(composeHoy(input({ facts: f })).systemic).toEqual([]);
    // Sábado 26 → ya debería verse.
    const sat = composeHoy(
      input({
        facts: f,
        now: new Date('2026-09-26T10:00:00Z'),
        calendar: { ...CAL, today: '2026-09-26' },
      }),
    );
    expect(sat.systemic[0]).toMatchObject({
      kind: 'week_hidden',
      title: '1 atleta no verá la semana que viene',
      week_start: '2026-09-28',
      detail: 'la semana del 28 sept al 4 oct sigue oculta',
    });
  });

  it('leads y llamadas solo con el add-on de Negocio', () => {
    const negocio = {
      leads: [{ id: '9', created_at: '2026-09-23T07:00:00Z' }],
      calls: [{ id: '4', starts_at: '2026-09-23T15:30:00Z' }],
    };
    expect(composeHoy(input({ negocio: null })).systemic).toEqual([]);
    const on = composeHoy(input({ negocio }));
    expect(on.systemic.map((g) => g.kind)).toEqual(['leads_new', 'calls_today']);
    expect(on.systemic[0]).toMatchObject({ title: '1 lead nuevo', detail: 'el más reciente, hace 3 h', item_ids: ['9'] });
    expect(on.systemic[1]!.detail).toBe('la primera, a las 17:30');
  });

  it('pausados fuera de todo', () => {
    const view = composeHoy(
      input({
        facts: [facts('1', { lifecycle: 'pausado', week_chip: { kind: 'no_lo_ve', label: 'No lo ve' } })],
        signals: new Map([['1', live(sig({ kind: 'readiness_low', severity: 'critical' }))]]),
      }),
    );
    expect(view.systemic).toEqual([]);
    expect(view.critico).toEqual([]);
    expect(view.week_visibility.total).toBe(0);
  });
});

describe('composeHoy — filas', () => {
  it('una fila por atleta, su peor señal como principal, crítico antes que vigilar', () => {
    const view = composeHoy(
      input({
        facts: [facts('1', { name: 'Bea' }), facts('2', { name: 'Ana' }), facts('3', { name: 'Carla' })],
        signals: new Map([
          [
            '1',
            live(
              sig({ kind: 'missed_sessions', severity: 'warning' }),
              sig({ kind: 'readiness_low', severity: 'critical', label: 'Readiness 31' }),
            ),
          ],
          ['2', live(sig({ kind: 'message_unanswered', severity: 'warning' }))],
          ['3', live(sig({ kind: 'transition_ready', severity: 'info' }))],
        ]),
      }),
    );
    expect(view.critico.map((r) => [r.name, r.primary.label, r.other_count])).toEqual([['Bea', 'Readiness 31', 1]]);
    expect(view.critico[0]!.others.map((s) => s.kind)).toEqual(['missed_sessions']);
    // «Listo para progresar» no es una fila.
    expect(view.vigilar.map((r) => r.name)).toEqual(['Ana']);
    expect(view.counts).toMatchObject({ critico: 1, vigilar: 1, needs_you: 2 });
    expect(view.critico[0]!.age_label).toBe('2 h');
  });

  it('lo que cubre un grupo no se repite como fila, pero lo demás del atleta sí', () => {
    const view = composeHoy(
      input({
        facts: [facts('1', { plan: 'sin_programa', week_chip: { kind: 'sin_plan', label: 'Sin plan' } })],
        signals: new Map([
          [
            '1',
            live(
              sig({ kind: 'programming_status', severity: 'warning', dedupe_key: 'programming_status:1:no_month' }),
              sig({ kind: 'message_unanswered', severity: 'warning', label: 'Por responder' }),
            ),
          ],
        ]),
      }),
    );
    expect(view.systemic.map((g) => g.kind)).toEqual(['no_program']);
    expect(view.vigilar.map((r) => [r.primary.kind, r.other_count])).toEqual([['message_unanswered', 0]]);
  });

  it('una semana vacía con programa SÍ es fila (no la cubre ningún grupo)', () => {
    const view = composeHoy(
      input({
        facts: [facts('1', { week_chip: { kind: 'semana_vacia', label: 'Semana vacía' } })],
        signals: new Map([
          ['1', live(sig({ kind: 'programming_status', severity: 'warning', dedupe_key: 'programming_status:1:empty_week' }))],
        ]),
      }),
    );
    expect(view.vigilar).toHaveLength(1);
  });

  it('pospuestos: fuera de la bandeja, contados y listados para deshacer', () => {
    const view = composeHoy(
      input({
        facts: [facts('1')],
        signals: new Map([
          [
            '1',
            {
              live: [],
              silenced: [
                { signal: sig({ kind: 'missed_sessions', severity: 'warning' }), by: 'snooze', until: '2026-09-26T22:00:00.000Z' },
              ],
              snoozed_until: '2026-09-26T22:00:00.000Z',
            },
          ],
        ]),
        resolved_today: 3,
      }),
    );
    expect(view.vigilar).toEqual([]);
    expect(view.counts).toMatchObject({ snoozed: 1, resolved_today: 3, needs_you: 0 });
    expect(view.snoozed_rows[0]).toMatchObject({ athlete_id: '1', until: '2026-09-26T22:00:00.000Z' });
  });
});
