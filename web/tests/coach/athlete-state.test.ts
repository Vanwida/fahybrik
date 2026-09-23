// El estado del atleta — un modelo para Hoy, Atletas, Mensajes y la ficha
// (shared/domain/coach/athlete-state, plan §4.1).

import { describe, expect, it } from 'vitest';
import {
  ageLabel,
  deriveAthleteStatus,
  isGroupOwnedSignal,
  reconcileSignals,
  relativeDay,
  shortDate,
  sortSignals,
  type AthleteSignal,
  type AthleteStateInput,
} from '@fahybrid/shared/domain/coach/athlete-state';

const NOW = new Date('2026-09-23T10:00:00.000Z');

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
    dedupe_key: `${p.kind}:1`,
    ...p,
  };
}

function input(p: Partial<AthleteStateInput> = {}): AthleteStateInput {
  return {
    lifecycle: 'activo',
    intake_pending: false,
    plan: 'con_programa',
    signals: [],
    now: NOW,
    ...p,
  };
}

describe('deriveAthleteStatus', () => {
  it('sin nada → Al día', () => {
    expect(deriveAthleteStatus(input())).toMatchObject({ key: 'al_dia', tone: 'ok', label: 'Al día', reason: null });
  });

  it('«Sin plan» se puede leer: el hueco de plan NO eleva a acción', () => {
    const s = deriveAthleteStatus(
      input({
        plan: 'sin_programa',
        signals: [sig({ kind: 'programming_status', severity: 'warning', dedupe_key: 'programming_status:1:no_month' })],
      }),
    );
    expect(s).toMatchObject({ key: 'sin_plan', tone: 'warn', label: 'Sin plan', reason: 'Todavía no tiene programa' });
  });

  it('programa terminado dice cuándo', () => {
    const s = deriveAthleteStatus(input({ plan: 'terminado', plan_ended_on: '2026-09-14' }));
    expect(s.reason).toBe('Su programa terminó el 14 sept y no tiene siguiente');
  });

  it('una señal crítica gana a todo menos a la pausa, con su motivo', () => {
    const s = deriveAthleteStatus(
      input({
        plan: 'sin_programa',
        intake_pending: true,
        signals: [sig({ kind: 'readiness_low', severity: 'critical', label: 'Readiness 31', evidence: '−24 vs su base 55' })],
      }),
    );
    expect(s).toMatchObject({ key: 'accion', tone: 'danger', reason: 'Readiness 31 · −24 vs su base 55' });
  });

  it('el alta pendiente es «nuevo», no acción, aunque el alta sea crítica', () => {
    const s = deriveAthleteStatus(
      input({
        intake_pending: true,
        intake_since: '2026-09-21T10:00:00.000Z',
        signals: [sig({ kind: 'intake_pending', severity: 'critical' })],
      }),
    );
    expect(s).toMatchObject({ key: 'nuevo', tone: 'info', label: 'Alta pendiente', reason: 'Terminó el cuestionario hace 2 d' });
  });

  it('el invitado sin cuestionario es «nuevo» (Invitado), no «sin plan»', () => {
    const s = deriveAthleteStatus(input({ not_onboarded: true, plan: 'sin_programa' }));
    expect(s).toMatchObject({ key: 'nuevo', label: 'Invitado', reason: 'Todavía no ha terminado el cuestionario de entrada' });
  });

  it('vigilar con la peor señal de vigilar como motivo', () => {
    const s = deriveAthleteStatus(
      input({
        signals: [
          sig({ kind: 'checkin_skipped', severity: 'warning', label: 'Sin check-in · 3 d' }),
          sig({ kind: 'missed_sessions', severity: 'warning', label: '2 de 4 debidas sin hacer' }),
        ],
      }),
    );
    expect(s.key).toBe('vigilar');
    // missed_sessions va antes que checkin_skipped en la prioridad.
    expect(s.reason).toBe('2 de 4 debidas sin hacer');
    expect(s.signals.map((x) => x.kind)).toEqual(['missed_sessions', 'checkin_skipped']);
  });

  it('las informativas no cambian el estado pero se listan', () => {
    const s = deriveAthleteStatus(input({ signals: [sig({ kind: 'transition_ready', severity: 'info' })] }));
    expect(s.key).toBe('al_dia');
    expect(s.signals).toHaveLength(1);
  });

  it('pausado y baja ganan a todo', () => {
    expect(deriveAthleteStatus(input({ lifecycle: 'pausado', pause_label: 'Lesión' }))).toMatchObject({
      key: 'pausado',
      tone: 'neutral',
      label: 'En pausa',
      reason: 'Lesión',
    });
    expect(deriveAthleteStatus(input({ lifecycle: 'baja' }))).toMatchObject({ key: 'pausado', label: 'Baja' });
  });
});

describe('sortSignals — peor primero', () => {
  it('severidad, luego prioridad del tipo, luego la más antigua', () => {
    const sorted = sortSignals([
      sig({ kind: 'missed_sessions', severity: 'warning' }),
      sig({ kind: 'readiness_low', severity: 'warning', first_seen_at: '2026-09-23T09:00:00Z' }),
      sig({ kind: 'billing_at_risk', severity: 'critical' }),
      sig({ kind: 'readiness_low', severity: 'warning', first_seen_at: '2026-09-22T09:00:00Z', dedupe_key: 'old' }),
    ]);
    expect(sorted.map((s) => `${s.kind}:${s.severity}`)).toEqual([
      'billing_at_risk:critical',
      'readiness_low:warning',
      'readiness_low:warning',
      'missed_sessions:warning',
    ]);
    expect(sorted[1]!.dedupe_key).toBe('old');
  });
});

describe('isGroupOwnedSignal', () => {
  it('alta, pago vencido y hueco de plan los resuelve un grupo; la semana vacía no', () => {
    expect(isGroupOwnedSignal(sig({ kind: 'intake_pending', severity: 'warning' }))).toBe(true);
    expect(isGroupOwnedSignal(sig({ kind: 'billing_at_risk', severity: 'critical' }))).toBe(true);
    expect(isGroupOwnedSignal(sig({ kind: 'billing_at_risk', severity: 'info' }))).toBe(false);
    expect(
      isGroupOwnedSignal(sig({ kind: 'programming_status', severity: 'warning', dedupe_key: 'programming_status:1:block_ended' })),
    ).toBe(true);
    expect(
      isGroupOwnedSignal(sig({ kind: 'programming_status', severity: 'warning', dedupe_key: 'programming_status:1:empty_week' })),
    ).toBe(false);
    expect(isGroupOwnedSignal(sig({ kind: 'readiness_low', severity: 'critical' }))).toBe(false);
  });
});

describe('fechas del panel (plan §2)', () => {
  it('«22 sept», «hoy», «ayer», edades cortas', () => {
    expect(shortDate('2026-09-22')).toBe('22 sept');
    expect(shortDate('2026-10-05T10:00:00Z')).toBe('5 oct');
    expect(relativeDay('2026-09-23', '2026-09-23')).toBe('hoy');
    expect(relativeDay('2026-09-22', '2026-09-23')).toBe('ayer');
    expect(relativeDay('2026-09-01', '2026-09-23')).toBe('1 sept');
    expect(ageLabel('2026-09-23T09:59:40Z', NOW)).toBe('ahora');
    expect(ageLabel('2026-09-23T09:20:00Z', NOW)).toBe('40 min');
    expect(ageLabel('2026-09-23T05:00:00Z', NOW)).toBe('5 h');
    expect(ageLabel('2026-09-20T09:00:00Z', NOW)).toBe('3 d');
  });
});

describe('te necesita (needs_you) — UNA definición para Hoy y «Necesitan algo»', () => {
  it('una semana oculta NO es «Al día»: vigilar con su motivo, y te necesita', () => {
    const s = deriveAthleteStatus(input({ week_hidden: 'actual' }));
    expect(s).toMatchObject({ key: 'vigilar', reason: 'Su semana está oculta al atleta', needs_you: true });
    const held = deriveAthleteStatus(input({ week_hidden: 'siguiente', week_held: true }));
    expect(held.reason).toBe('La semana que viene está retenida por ti');
  });

  it('una señal de vigilar gana el motivo a la semana oculta', () => {
    const s = deriveAthleteStatus(
      input({ week_hidden: 'actual', signals: [sig({ kind: 'missed_sessions', severity: 'warning', label: '2 sin hacer' })] }),
    );
    expect(s.reason).toBe('2 sin hacer');
  });

  it('sin plan, alta pendiente y pago vencido te necesitan; al día, pausa e invitado no', () => {
    expect(deriveAthleteStatus(input({ plan: 'sin_programa' })).needs_you).toBe(true);
    expect(deriveAthleteStatus(input({ intake_pending: true })).needs_you).toBe(true);
    expect(
      deriveAthleteStatus(input({ signals: [sig({ kind: 'billing_at_risk', severity: 'critical' })] })).needs_you,
    ).toBe(true);
    expect(deriveAthleteStatus(input()).needs_you).toBe(false);
    expect(deriveAthleteStatus(input({ lifecycle: 'pausado', plan: 'sin_programa' })).needs_you).toBe(false);
    // Invitado sin cuestionario: ni el hueco de plan ni la señal del motor le hacen «necesitar» nada.
    const invited = deriveAthleteStatus(
      input({
        not_onboarded: true,
        plan: 'sin_programa',
        signals: [sig({ kind: 'programming_status', severity: 'warning', dedupe_key: 'programming_status:1:no_month' })],
      }),
    );
    expect(invited).toMatchObject({ key: 'nuevo', needs_you: false });
  });

  it('las informativas no te necesitan', () => {
    expect(
      deriveAthleteStatus(input({ signals: [sig({ kind: 'transition_ready', severity: 'info' })] })).needs_you,
    ).toBe(false);
  });
});

describe('reconcileSignals — el dato fresco gana a lo que persistió el barrido', () => {
  const plan = sig({ kind: 'programming_status', severity: 'warning', dedupe_key: 'programming_status:1:no_month' });
  const msg = sig({ kind: 'message_unanswered', severity: 'warning' });
  it('el plan: solo sigue la señal cuyo estado coincide con el de ahora', () => {
    expect(reconcileSignals([plan], { programming_status: 'no_month' })).toHaveLength(1);
    expect(reconcileSignals([plan], { programming_status: 'ok' })).toHaveLength(0);
  });
  it('el mensaje: fuera si el hilo ya no está por responder; se deja si no se sabe', () => {
    expect(reconcileSignals([msg], { programming_status: 'ok', awaiting_reply: false })).toHaveLength(0);
    expect(reconcileSignals([msg], { programming_status: 'ok', awaiting_reply: true })).toHaveLength(1);
    expect(reconcileSignals([msg], { programming_status: 'ok' })).toHaveLength(1);
  });
});

describe('peor primero DENTRO de un tipo (no por edad)', () => {
  it('«3 de 5 sin hacer» va antes que «2 de 6», aunque sea más nueva', () => {
    const older = sig({ kind: 'missed_sessions', severity: 'warning', value: 2, baseline: 6, first_seen_at: '2026-09-20T08:00:00.000Z', dedupe_key: 'a' });
    const worse = sig({ kind: 'missed_sessions', severity: 'warning', value: 3, baseline: 5, first_seen_at: '2026-09-23T08:00:00.000Z', dedupe_key: 'b' });
    expect(sortSignals([older, worse]).map((s) => s.dedupe_key)).toEqual(['b', 'a']);
  });

  it('a igual proporción, más entrenos sin hacer; a igualdad total, la más antigua', () => {
    const a = sig({ kind: 'missed_sessions', severity: 'warning', value: 2, baseline: 4, dedupe_key: 'a' });
    const b = sig({ kind: 'missed_sessions', severity: 'warning', value: 3, baseline: 6, dedupe_key: 'b' });
    expect(sortSignals([a, b]).map((s) => s.dedupe_key)).toEqual(['b', 'a']);
    const c = sig({ kind: 'missed_sessions', severity: 'warning', value: 2, baseline: 4, first_seen_at: '2026-09-20T08:00:00.000Z', dedupe_key: 'c' });
    expect(sortSignals([a, c]).map((s) => s.dedupe_key)).toEqual(['c', 'a']);
  });

  it('un readiness más bajo va antes', () => {
    const a = sig({ kind: 'readiness_low', severity: 'warning', value: 38, dedupe_key: 'a' });
    const b = sig({ kind: 'readiness_low', severity: 'warning', value: 30, dedupe_key: 'b' });
    expect(sortSignals([a, b]).map((s) => s.dedupe_key)).toEqual(['b', 'a']);
  });
});
