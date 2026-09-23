// La adherencia del coach — solo lo que ya tocaba (shared/domain/coach/adherence).
//
// Los casos salen del informe C de la auditoría del panel: un miércoles con
// lunes y martes hechos pintaba «40 % cayendo» porque contaba el resto de la
// semana. Aquí se fija la fórmula única que ahora leen todas las superficies.

import { describe, expect, it } from 'vitest';
import {
  computeAdherence,
  type AdherenceSession,
} from '@fahybrid/shared/domain/coach/adherence';

// Semana del 21 sept 2026 (lunes) — miércoles 23 = hoy.
const WED = '2026-09-23';

function s(day: string, status: AdherenceSession['status'], extra: Partial<AdherenceSession> = {}): AdherenceSession {
  return { scheduled_for: day, status, ...extra };
}

describe('computeAdherence — due-only', () => {
  it('miércoles con lunes y martes hechos y el resto pendiente = 100 %', () => {
    const week = [
      s('2026-09-21', 'completed'),
      s('2026-09-22', 'completed'),
      s('2026-09-23', 'scheduled'),
      s('2026-09-24', 'scheduled'),
      s('2026-09-26', 'scheduled'),
    ];
    const r = computeAdherence(week, WED, 7);
    expect(r).toMatchObject({ pct: 100, due: 2, done: 2, missed: 0, window_days: 7 });
  });

  it('la sesión de hoy sin hacer no cuenta; hecha, sí', () => {
    const pending = computeAdherence([s('2026-09-22', 'completed'), s(WED, 'scheduled')], WED, 7);
    expect(pending).toMatchObject({ pct: 100, due: 1, done: 1 });

    const doneToday = computeAdherence([s('2026-09-22', 'missed'), s(WED, 'completed')], WED, 7);
    expect(doneToday).toMatchObject({ pct: 50, due: 2, done: 1 });
  });

  it('un «missed» de hoy aún no es debido (el día no ha acabado)', () => {
    const r = computeAdherence([s(WED, 'missed')], WED, 7);
    expect(r).toMatchObject({ pct: null, due: 0 });
  });

  it('parcial cuenta como hecha', () => {
    const r = computeAdherence([s('2026-09-21', 'partial'), s('2026-09-22', 'missed')], WED, 7);
    expect(r).toMatchObject({ pct: 50, due: 2, done: 1, missed: 1, last_missed_on: '2026-09-22' });
  });

  it('una ejecución registrada es hecha aunque el estado no se moviera', () => {
    const r = computeAdherence([s('2026-09-22', 'scheduled', { executed: true })], WED, 7);
    expect(r).toMatchObject({ pct: 100, due: 1, done: 1 });
  });

  it('nada debido → pct null, nunca 0', () => {
    expect(computeAdherence([], WED, 14)).toMatchObject({ pct: null, due: 0, done: 0 });
    expect(computeAdherence([s('2026-09-25', 'scheduled')], WED, 14)).toMatchObject({
      pct: null,
      due: 0,
    });
  });

  it('una sesión pasada sin marcar (scheduled) es debida y no hecha', () => {
    const r = computeAdherence([s('2026-09-21', 'scheduled'), s('2026-09-22', 'completed')], WED, 7);
    expect(r).toMatchObject({ pct: 50, due: 2, done: 1, last_missed_on: '2026-09-21' });
  });

  it('respeta la ventana: lo anterior a ella no cuenta', () => {
    const r = computeAdherence(
      [s('2026-09-16', 'missed'), s('2026-09-17', 'completed'), s('2026-09-22', 'completed')],
      WED,
      7,
    );
    // Ventana 7 d = 17–23 sept: el 16 queda fuera.
    expect(r).toMatchObject({ pct: 100, due: 2, done: 2 });
  });

  it('el entreno libre, la pausa y el descanso por lesión no son debidos', () => {
    const r = computeAdherence(
      [
        s('2026-09-21', 'scheduled', { origin: 'self' }),
        s('2026-09-21', 'missed', { excluded: true }),
        s('2026-09-22', 'completed'),
      ],
      WED,
      7,
    );
    expect(r).toMatchObject({ pct: 100, due: 1, done: 1 });
  });

  it('semana oculta: lo no hecho no es debido (no lo veía); lo hecho sí cuenta', () => {
    const r = computeAdherence(
      [
        s('2026-09-21', 'missed', { visible: false }),
        s('2026-09-22', 'completed', { visible: false }),
      ],
      WED,
      7,
    );
    expect(r).toMatchObject({ pct: 100, due: 1, done: 1, missed: 0 });
  });

  it('redondea a entero 0–100', () => {
    const r = computeAdherence(
      [s('2026-09-20', 'completed'), s('2026-09-21', 'completed'), s('2026-09-22', 'missed')],
      WED,
      7,
    );
    expect(r.pct).toBe(67);
  });
});
