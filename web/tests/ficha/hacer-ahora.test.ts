import { describe, expect, it } from 'vitest';
import { buildHacerAhora, missedIsActionable, statusReasonParts } from '@/lib/dashboard/v2/ficha-actions';
import { shell, signal } from './fixtures';

describe('Hacer ahora', () => {
  it('al día y con plan: nada que hacer', () => {
    expect(buildHacerAhora(shell())).toEqual([]);
  });
  it('semana oculta → publicarla (H2: antes no se veía)', () => {
    const chips = buildHacerAhora(
      shell({ publish_target: { week_start: '2026-09-21', sessions: 5, due: true, opens_on: '2026-09-18' } }),
    );
    expect(chips[0]).toMatchObject({ kind: 'publicar', label: 'Publicar 21–27 sept', week_start: '2026-09-21' });
  });
  it('la semana que se publicará sola en su día no es tarea todavía', () => {
    const chips = buildHacerAhora(
      shell({ publish_target: { week_start: '2026-09-28', sessions: 5, due: false, opens_on: '2026-09-25' } }),
    );
    expect(chips.map((c) => c.kind)).not.toContain('publicar');
  });
  it('check-in con comentario sin contestar → responder citándolo', () => {
    const chips = buildHacerAhora(
      shell({ last_checkin: { on: '2026-09-22', notes: 'Bien, la última me costó', score: 42, answered: false } }),
    );
    expect(chips[0]).toMatchObject({ kind: 'responder', label: 'Responder', cause: 'Por responder' });
    expect(chips[0]!.evidence).toContain('Check-in del 22 sept: «Bien, la última me costó»');
  });
  it('debida sin hacer → ajustar ese día, y readiness bajo → descarga de esta semana', () => {
    const chips = buildHacerAhora(
      shell({
        last_missed: { id: '183', date: '2026-09-23', title: 'Z2' },
        status: { key: 'accion', tone: 'danger', label: 'Acción', reason: null, signals: [signal({})], snoozed_until: null, needs_you: false },
      }),
    );
    expect(chips.map((c) => c.kind)).toEqual(['descarga', 'ajustar']);
    expect(chips[1]).toMatchObject({ session_id: '183', label: 'Ajustar miércoles 23 (sin hacer)' });
    expect(chips[0]!.week_start).toBe('2026-09-21');
  });
  it('un sin hacer viejo es historia: solo se ofrece de esta semana o de los 7 días anteriores', () => {
    const at = (date: string) =>
      buildHacerAhora(shell({ last_missed: { id: '9', date, title: 'Z2' } })).map((c) => c.kind);
    // hoy es miércoles 23: el lunes 21, el martes 22 y el miércoles 16 (7 días) valen
    expect(at('2026-09-22')).toEqual(['ajustar']);
    expect(at('2026-09-16')).toEqual(['ajustar']);
    // el sábado 12 (11 días, el caso de la revisión) y el martes 15 (8 días) no
    expect(at('2026-09-15')).toEqual([]);
    expect(at('2026-09-12')).toEqual([]);
  });
  it('en domingo la semana en curso entera cuenta (lunes = 6 días)', () => {
    expect(missedIsActionable('2026-09-21', '2026-09-27')).toBe(true);
    expect(missedIsActionable('2026-09-19', '2026-09-27')).toBe(false);
    expect(missedIsActionable('2026-09-24', '2026-09-23')).toBe(false);
  });
  it('una propuesta pendiente abre su revisión sin inventar qué semana ajusta', () => {
    const chips = buildHacerAhora(shell({
      status: { key: 'accion', tone: 'danger', label: 'Acción', reason: null, signals: [signal({ kind: 'week_adjustment_pending' })], snoozed_until: null, needs_you: true },
    }));
    expect(chips).toMatchObject([{ kind: 'evaluar', label: 'Revisar ajuste propuesto' }]);
    expect(chips[0]!.week_start).toBeUndefined();
  });
  it('sin plan de hoy en adelante → asignar; en pausa no', () => {
    expect(buildHacerAhora(shell({ has_upcoming_plan: false }))[0]!.kind).toBe('asignar');
    const paused = shell({ has_upcoming_plan: false });
    paused.lifecycle = { ...paused.lifecycle, status: 'pausado' };
    expect(buildHacerAhora(paused)).toEqual([]);
  });
  it('conserva todas las tareas en orden para el despliegue', () => {
    const chips = buildHacerAhora(
      shell({
        intake_pending: true,
        publish_target: { week_start: '2026-09-21', sessions: 5, due: true, opens_on: null },
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
    expect(chips.map((c) => c.kind)).toEqual(['descarga', 'pago', 'alta', 'publicar', 'responder', 'ajustar', 'comunicado']);
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
