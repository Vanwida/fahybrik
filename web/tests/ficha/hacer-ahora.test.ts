import { describe, expect, it } from 'vitest';
import { buildHacerAhora, statusReasonParts } from '@/lib/dashboard/v2/ficha-actions';
import type { FichaShell } from '@/lib/dashboard/v2/atleta-detalle-types';
import type { AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';

function signal(over: Partial<AthleteSignal>): AthleteSignal {
  return {
    kind: 'readiness_low',
    severity: 'critical',
    label: 'Readiness 31',
    evidence: '−24 vs su base 55 · 3 días',
    value: 31,
    baseline: 55,
    window_label: null,
    observed_at: null,
    action: 'proponer_descarga',
    lens: 'fisiologia',
    first_seen_at: null,
    dedupe_key: 'x',
    ...over,
  };
}

function shell(over: Partial<FichaShell> = {}): FichaShell {
  return {
    athlete_id: '11',
    name: 'Marc Vidal',
    avatar_url: null,
    email: null,
    level: null,
    division_label: null,
    race: null,
    program: null,
    group: null,
    status: { key: 'al_dia', tone: 'ok', label: 'Al día', reason: null, signals: [], snoozed_until: null, needs_you: false },
    lifecycle: {
      status: 'activo',
      pause_reason: null,
      paused_since: null,
      planned_return: null,
      paused_by_name: null,
      paused_by_kind: null,
      baja_at: null,
      baja_reason: null,
      baja_by_name: null,
      pending_request: null,
      baja_scheduled_for: null,
      baja_scheduled_in_days: null,
      pause_days_available: null,
    },
    unread: 0,
    awaiting_reply: false,
    today: '2026-09-23',
    readiness: null,
    week_days: [],
    adherence: null,
    intake_pending: false,
    has_upcoming_plan: true,
    publish_target: null,
    pending_comunicados: 0,
    last_missed: null,
    last_checkin: null,
    personal_plan: null,
    club_name: 'Club',
    ...over,
  };
}

describe('Hacer ahora', () => {
  it('al día y con plan: nada que hacer', () => {
    expect(buildHacerAhora(shell())).toEqual([]);
  });
  it('semana oculta → publicarla (H2: antes no se veía)', () => {
    const chips = buildHacerAhora(shell({ publish_target: { week_start: '2026-09-21', sessions: 5 } }));
    expect(chips[0]).toMatchObject({ kind: 'publicar', label: 'Publicar 21–27 sept', week_start: '2026-09-21' });
  });
  it('check-in con comentario sin contestar → responder citándolo', () => {
    const chips = buildHacerAhora(
      shell({ last_checkin: { on: '2026-09-22', notes: 'Bien, la última me costó', score: 42, answered: false } }),
    );
    expect(chips[0]!.label).toBe('Responder check-in «Bien, la última me costó»');
  });
  it('debida sin hacer → ajustar ese día, y readiness bajo → descarga de esta semana', () => {
    const chips = buildHacerAhora(
      shell({
        last_missed: { id: '183', date: '2026-09-23', title: 'Z2' },
        status: { key: 'accion', tone: 'danger', label: 'Acción', reason: null, signals: [signal({})], snoozed_until: null, needs_you: false },
      }),
    );
    expect(chips.map((c) => c.kind)).toEqual(['ajustar', 'descarga']);
    expect(chips[0]).toMatchObject({ session_id: '183', label: 'Ajustar miércoles 23 (sin hacer)' });
    expect(chips[1]!.week_start).toBe('2026-09-21');
  });
  it('sin plan de hoy en adelante → asignar; en pausa no', () => {
    expect(buildHacerAhora(shell({ has_upcoming_plan: false }))[0]!.kind).toBe('asignar');
    const paused = shell({ has_upcoming_plan: false });
    paused.lifecycle = { ...paused.lifecycle, status: 'pausado' };
    expect(buildHacerAhora(paused)).toEqual([]);
  });
  it('como mucho cuatro', () => {
    const chips = buildHacerAhora(
      shell({
        intake_pending: true,
        publish_target: { week_start: '2026-09-21', sessions: 5 },
        awaiting_reply: true,
        last_missed: { id: '1', date: '2026-09-22', title: 'Z2' },
        pending_comunicados: 2,
        status: {
          key: 'accion',
          tone: 'danger',
          label: 'Acción',
          reason: null,
          signals: [signal({}), signal({ kind: 'billing_at_risk', label: 'Pago vencido' })],
          snoozed_until: null,
          needs_you: true,
        },
      }),
    );
    expect(chips).toHaveLength(4);
  });
});

describe('motivo del estado (H1)', () => {
  it('la evidencia de las señales, peor primero, sin repetir el nombre del estado', () => {
    const s = shell({
      status: {
        key: 'nuevo',
        tone: 'info',
        label: 'Alta pendiente',
        reason: 'x',
        signals: [
          signal({ label: 'Alta pendiente', evidence: 'terminó el cuestionario hace 1 d', severity: 'info' }),
          signal({}),
        ],
        snoozed_until: null,
        needs_you: true,
      },
    });
    expect(statusReasonParts(s)).toEqual(['terminó el cuestionario hace 1 d', 'Readiness 31 (−24 vs su base 55 · 3 días)']);
  });
  it('sin señales cae a la razón del estado', () => {
    const s = shell({ status: { key: 'sin_plan', tone: 'warn', label: 'Sin plan', reason: 'Sin programa', signals: [], snoozed_until: null, needs_you: false } });
    expect(statusReasonParts(s)).toEqual(['Sin programa']);
  });
});
