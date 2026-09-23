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
    next_week_due: false,
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
    // La cifra cuenta ATLETAS: 1-2 (semana), 3-4 (sin programa), 5 (alta), 6 (pago).
    expect(view.counts.needs_you).toBe(6);
    // «programadas» = con entrenos esta semana (visibles u ocultos): 5-6 y 1-2.
    expect(view.week_visibility).toEqual({ visible: 2, total: 7, programmed: 4 });
    // 6 está en Acción solo por el pago (lo cubre su grupo): sin fila, contado aparte.
    expect(view.counts.accion_in_groups).toBe(1);
  });

  it('la semana que viene solo es grupo cuando, por la regla del coach, ya debería verse', () => {
    // `next_week_due` lo decide plan-facts con la regla del coach (N días antes).
    const f = [facts('1', { next_week_hidden: true, next_week_sessions: 4 })];
    // Miércoles con N = 2 → se abre el sábado: todavía no es un problema.
    expect(composeHoy(input({ facts: f })).systemic).toEqual([]);
    // Sábado 26 → ya debería verse.
    const sat = composeHoy(
      input({
        facts: [facts('1', { next_week_hidden: true, next_week_sessions: 4, next_week_due: true })],
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
          ['2', live(sig({ kind: 'rpe_high', severity: 'warning' }))],
          ['3', live(sig({ kind: 'transition_ready', severity: 'info' }))],
        ]),
      }),
    );
    expect(view.critico.map((r) => [r.name, r.primary.label, r.other_count])).toEqual([['Bea', 'Readiness 31', 1]]);
    expect(view.critico[0]!.others.map((s) => s.kind)).toEqual(['missed_sessions']);
    // «Listo para progresar» no es una fila.
    expect(view.vigilar.map((r) => r.name)).toEqual(['Ana']);
    expect(view.counts).toMatchObject({ critico: 1, vigilar: 1, needs_you: 2, accion_in_groups: 0 });
    expect(view.critico[0]!.age_label).toBe('2 h');
  });

  it('Vigilar de Hoy = Vigilar de Atletas: un alta pendiente con avisos va en su grupo, no en otra fila', () => {
    const view = composeHoy(
      input({
        facts: [facts('1', { intake_pending: true, onboarded_at: '2026-09-20T10:00:00Z' })],
        signals: new Map([['1', live(sig({ kind: 'missed_sessions', severity: 'warning' }))]]),
      }),
    );
    expect(view.systemic.map((g) => g.kind)).toEqual(['intake_pending']);
    expect(view.vigilar).toEqual([]);
    expect(view.counts.needs_you).toBe(1);
  });

  it('lo que cubre un grupo no se repite como fila', () => {
    const view = composeHoy(
      input({
        facts: [facts('1', { plan: 'sin_programa', week_chip: { kind: 'sin_plan', label: 'Sin plan' } })],
        signals: new Map([
          [
            '1',
            live(
              sig({ kind: 'programming_status', severity: 'warning', dedupe_key: 'programming_status:1:no_month' }),
              sig({ kind: 'rpe_high', severity: 'warning', label: 'RPE alto' }),
            ),
          ],
        ]),
      }),
    );
    // «Sin plan» es su estado y su grupo: el RPE se ve al asignarle (no es otra fila).
    expect(view.systemic.map((g) => g.kind)).toEqual(['no_program']);
    expect(view.vigilar).toEqual([]);
  });

  it('una semana vacía con programa SÍ es fila (no la cubre ningún grupo)', () => {
    const view = composeHoy(
      input({
        facts: [
          facts('1', {
            week_chip: { kind: 'semana_vacia', label: 'Semana vacía' },
            programming: { athlete_id: '1', status: 'empty_week', label: 'Semana vacía', detail: null, cta: null, cta_label: null },
          }),
        ],
        signals: new Map([
          ['1', live(sig({ kind: 'programming_status', severity: 'warning', dedupe_key: 'programming_status:1:empty_week' }))],
        ]),
      }),
    );
    expect(view.vigilar).toHaveLength(1);
  });

  it('una señal de plan que ya no es verdad (asignado después del barrido) no es fila ni cuenta', () => {
    const view = composeHoy(
      input({
        facts: [facts('1')], // programming: ok — tiene programa AHORA
        signals: new Map([
          ['1', live(sig({ kind: 'programming_status', severity: 'warning', dedupe_key: 'programming_status:1:empty_week' }))],
        ]),
      }),
    );
    expect(view.vigilar).toHaveLength(0);
    expect(view.counts.needs_you).toBe(0);
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

describe('composeHoy — «Todo» es todo: lo que espera respuesta está en la bandeja', () => {
  const aw = (hoursAgo: number, count = 1) => ({
    count,
    since: new Date(NOW.getTime() - hoursAgo * 3_600_000),
    last_at: new Date(NOW.getTime() - hoursAgo * 3_600_000),
    unread: count,
    open: true,
  });

  it('las esperas son UN grupo en Todo (la más antigua primero) y cada una fila en su filtro', () => {
    const view = composeHoy(
      input({
        facts: [facts('1', { name: 'Ana' }), facts('2', { name: 'Bea' }), facts('3', { name: 'Carla' })],
        // 3 ya pasó el umbral del coach: su espera es señal de vigilar, y NO fila aparte.
        signals: new Map([['3', live(sig({ kind: 'message_unanswered', severity: 'warning', label: 'Por responder' }))]]),
        awaiting: new Map([
          ['1', aw(2)],
          ['2', aw(30, 3)],
          ['3', aw(14)],
        ]),
      }),
    );
    expect(view.systemic[0]).toMatchObject({
      kind: 'awaiting_reply',
      count: 3,
      title: '3 por responder',
      detail: 'la más antigua espera 1 d',
      athlete_ids: ['2', '3', '1'],
    });
    expect(view.vigilar).toEqual([]);
    expect(view.replies.map((r) => [r.name, r.primary.severity])).toEqual([
      ['Bea', 'info'],
      ['Carla', 'warning'],
      ['Ana', 'info'],
    ]);
    // Quien espera respuesta te necesita desde el primer minuto (la cifra de Hoy = Atletas).
    expect(view.counts.needs_you).toBe(3);
    expect(view.counts.awaiting_reply).toBe(3);
  });

  it('una espera de un atleta con otra fila: la fila es lo suyo, la espera va al grupo', () => {
    const view = composeHoy(
      input({
        facts: [facts('1', { name: 'Ana' })],
        signals: new Map([['1', live(sig({ kind: 'rpe_high', severity: 'warning' }))]]),
        awaiting: new Map([['1', aw(3)]]),
      }),
    );
    expect(view.vigilar.map((r) => [r.primary.kind, r.others.map((s) => s.kind)])).toEqual([['rpe_high', []]]);
    expect(view.systemic.map((g) => g.kind)).toEqual(['awaiting_reply']);
    expect(view.counts.needs_you).toBe(1);
  });
});

describe('composeHoy — secciones = estado del atleta; la descarga dice lo que contestó el motor', () => {
  it('Acción = estado acción aunque la fila sea de vigilar; lo cubierto por un grupo se cuenta aparte', () => {
    const view = composeHoy(
      input({
        facts: [facts('1', { name: 'Ana' }), facts('2', { name: 'Bea' })],
        signals: new Map([
          // Ana: pago vencido (grupo) + entrenos sin hacer → estado acción, fila en Acción.
          ['1', live(sig({ kind: 'billing_at_risk', severity: 'critical' }), sig({ kind: 'missed_sessions', severity: 'warning' }))],
          // Bea: solo el pago → sin fila, contada en «+1 con el pago vencido».
          ['2', live(sig({ kind: 'billing_at_risk', severity: 'critical' }))],
        ]),
      }),
    );
    expect(view.critico.map((r) => [r.name, r.primary.kind])).toEqual([['Ana', 'missed_sessions']]);
    expect(view.vigilar).toEqual([]);
    expect(view.counts).toMatchObject({ critico: 1, accion_in_groups: 1 });
  });

  it('«mantener» del motor posterior a la señal: la fila lo dice; uno anterior no cuenta', () => {
    const descarga = sig({
      kind: 'readiness_low',
      severity: 'critical',
      action: 'proponer_descarga',
      first_seen_at: '2026-09-23T08:00:00.000Z',
    });
    const proposal = (created_at: string) =>
      new Map([
        [
          '1',
          {
            id: '7',
            status: 'pending',
            recommendation: 'keep',
            summary: 'No hay un entreno de recuperación en tu biblioteca para cambiarlo: ajústalo a mano',
            created_at,
            signal_kinds: ['readiness_low'],
          },
        ],
      ]);
    const after = composeHoy(
      input({ facts: [facts('1')], signals: new Map([['1', live(descarga)]]), proposals: proposal('2026-09-23T09:00:00.000Z') }),
    );
    expect(after.critico[0]!.proposal).toEqual({
      id: '7',
      outcome: 'mantener',
      summary: 'No hay un entreno de recuperación en tu biblioteca para cambiarlo: ajústalo a mano',
    });
    const before = composeHoy(
      input({ facts: [facts('1')], signals: new Map([['1', live(descarga)]]), proposals: proposal('2026-09-22T09:00:00.000Z') }),
    );
    expect(before.critico[0]!.proposal).toBeNull();
    // Una respuesta que no leyó la señal (la evaluación semanal) tampoco cuenta.
    const blind = new Map([['1', { ...proposal('2026-09-23T09:00:00.000Z').get('1')!, signal_kinds: [] }]]);
    expect(composeHoy(input({ facts: [facts('1')], signals: new Map([['1', live(descarga)]]), proposals: blind })).critico[0]!.proposal).toBeNull();
  });
});

