import { describe, expect, it } from 'vitest';
import {
  addSession,
  buildCalendarWeeks,
  calendarRange,
  canDropOn,
  dayLoads,
  lastMissed,
  moveSession,
  removeSession,
  sessionModality,
} from '@/lib/dashboard/v2/ficha-calendar-model';
import type { CalSession, FichaCalendar } from '@/lib/dashboard/v2/atleta-detalle-types';

const TODAY = '2026-09-23'; // miércoles

function ses(over: Partial<CalSession>): CalSession {
  return {
    id: '1',
    date: '2026-09-21',
    title: 'Umbral',
    modality: 'carrera',
    modality_label: 'Carrera',
    status: 'scheduled',
    done: false,
    missed: false,
    excluded: false,
    planned_min: null,
    planned_open: false,
    has_content: true,
    editable: true,
    rpe: null,
    ...over,
  };
}

function cal(sessions: CalSession[], visible = true): FichaCalendar {
  const { from, to } = calendarRange('3sem', TODAY, null);
  const states = new Map(
    ['2026-09-21', '2026-09-28', '2026-10-05'].map((w) => [
      w,
      { week_start: w, visible, held: false, status: visible ? null : ('draft' as const), opens_on: null, sessions: 0 },
    ]),
  );
  return { zoom: '3sem', from, to, today: TODAY, weeks: buildCalendarWeeks({ sessions, weekStates: states, from, to, today: TODAY }) };
}

describe('calendarRange', () => {
  it('3 semanas desde el lunes de hoy', () => {
    expect(calendarRange('3sem', TODAY, null)).toEqual({ from: '2026-09-21', to: '2026-10-11' });
  });
  it('semana = la de hoy', () => {
    expect(calendarRange('semana', TODAY, null)).toEqual({ from: '2026-09-21', to: '2026-09-27' });
  });
  it('plan completo: del primer al último entreno, con hoy dentro', () => {
    expect(calendarRange('plan', TODAY, { first: '2026-09-02', last: '2026-11-04' })).toEqual({
      from: '2026-08-31',
      to: '2026-11-08',
    });
  });
  it('plan completo no pasa de 26 semanas ni de 8 hacia atrás', () => {
    const r = calendarRange('plan', TODAY, { first: '2025-01-01', last: '2028-01-01' });
    expect(r.from).toBe('2026-07-27');
    const weeks = (Date.parse(r.to) - Date.parse(r.from) + 86_400_000) / (7 * 86_400_000);
    expect(weeks).toBe(26);
  });
});

describe('semanas y adherencia due-only', () => {
  it('cuenta lo debido y lo hecho, nunca el futuro', () => {
    const c = cal([
      ses({ id: 'a', date: '2026-09-21', done: true, status: 'completed' }),
      ses({ id: 'b', date: '2026-09-22', missed: true }),
      ses({ id: 'c', date: '2026-09-23' }), // hoy sin hacer: no debida
      ses({ id: 'd', date: '2026-09-25' }), // futuro
    ]);
    expect(c.weeks[0]).toMatchObject({ due: 2, done: 1 });
  });
  it('una semana oculta no cuenta lo no hecho', () => {
    const c = cal([ses({ id: 'b', date: '2026-09-22' }), ses({ id: 'a', date: '2026-09-21', done: true })], false);
    expect(c.weeks[0]).toMatchObject({ due: 1, done: 1 });
  });
  it('cada día enseña TODOS sus entrenos (R4)', () => {
    const c = cal([ses({ id: 'a' }), ses({ id: 'b' })]);
    expect(c.weeks[0]!.days[0]!.sessions.map((s) => s.id)).toEqual(['a', 'b']);
  });
  it('la carga por día suma los minutos escritos y deja null lo no escrito', () => {
    const c = cal([ses({ id: 'a', planned_min: 45 }), ses({ id: 'b', planned_min: 30 }), ses({ id: 'c', date: '2026-09-24' })]);
    expect(dayLoads(c.weeks[0]!)).toEqual([75, null, null, null, null, null, null]);
    expect(c.weeks[0]!.planned_min).toBe(75);
    expect(c.weeks[0]!.planned_open).toBe(1);
  });
});

describe('cambios optimistas', () => {
  it('mover cambia de día y de semana, y deshacer lo devuelve', () => {
    const c = cal([ses({ id: 'a', date: '2026-09-24' })]);
    const moved = moveSession(c, 'a', '2026-09-29');
    expect(moved.weeks[0]!.days.flatMap((d) => d.sessions)).toHaveLength(0);
    expect(moved.weeks[1]!.days[1]!.sessions[0]!.id).toBe('a');
    expect(moved.weeks[1]!.state.sessions).toBe(1);
    const back = moveSession(moved, 'a', '2026-09-24');
    expect(back.weeks[0]!.days[3]!.sessions[0]!.id).toBe('a');
  });
  it('quitar y añadir', () => {
    const c = cal([ses({ id: 'a' })]);
    expect(removeSession(c, 'a').weeks[0]!.days[0]!.sessions).toHaveLength(0);
    expect(addSession(c, ses({ id: 'z', date: '2026-10-01' })).weeks[1]!.days[3]!.sessions[0]!.id).toBe('z');
  });
  it('solo se suelta hoy o después', () => {
    expect(canDropOn('2026-09-22', TODAY)).toBe(false);
    expect(canDropOn(TODAY, TODAY)).toBe(true);
  });
  it('la debida sin hacer más reciente', () => {
    const c = cal([ses({ id: 'a', date: '2026-09-21', missed: true }), ses({ id: 'b', date: '2026-09-22', missed: true })]);
    expect(lastMissed(c)?.id).toBe('b');
  });
});

describe('sessionModality', () => {
  it('manda la de los ejercicios; el formato es el último recurso', () => {
    expect(sessionModality('fuerza', 'amrap').modality).toBe('fuerza');
    expect(sessionModality(null, 'amrap')).toEqual({ modality: 'circuito', label: 'Circuito' });
    expect(sessionModality('mixta', null)).toEqual({ modality: null, label: 'Mixta' });
    expect(sessionModality(null, null)).toEqual({ modality: null, label: 'Entreno' });
  });
});
