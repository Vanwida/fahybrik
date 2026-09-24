// «Progresar selección» con nada que cambiar dice POR QUÉ (revisión de
// producto, ola 4): antes era un botón gris «Nada que cambiar» a secas.

import { describe, expect, test } from 'vitest';
import { parseNotationCell } from '../../../shared/domain/import/notation';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import { gridFromWeeks } from '@/lib/dashboard/programming/grid-model';
import { noChangeReason } from '@/components/v2/planes/progress-reason';

function dayOf(dow: number, ...lines: string[]): WeekDay {
  return {
    day_of_week: dow,
    sessions: [
      {
        kind: 'workout',
        template_id: null,
        blocks: lines.map((l, i) => ({
          uid: `b${i}`,
          format: 'sets',
          title: l,
          items: [{ uid: `i${i}`, exercise_id: 1, exercise_name: l, prescription_json: parseNotationCell(l)[0]!.prescription }],
        })),
      },
    ],
  };
}

const bounds = { rows: 3, cols: 7 };
const all = { r0: 0, r1: 2, c0: 0, c1: 6 };

describe('noChangeReason', () => {
  test('una selección vacía lo dice', () => {
    const g = gridFromWeeks([{ days: [] }, { days: [] }, { days: [] }]);
    expect(noChangeReason(g, all, bounds, 'load')).toBe('La selección no tiene entrenos escritos.');
  });

  test('carga sin %RM ni kg escritos → dice que falta la carga', () => {
    const g = gridFromWeeks([{ days: [dayOf(1, "45' carrera z2")] }, { days: [dayOf(1, 'burpees 5x10 @rpe8')] }, { days: [] }]);
    expect(noChangeReason(g, all, bounds, 'load')).toMatch(/carga escrita \(%RM o kg\)/);
  });

  test('series: ningún entreno con series o rondas', () => {
    const g = gridFromWeeks([{ days: [dayOf(1, "45' carrera z2")] }, { days: [] }, { days: [] }]);
    expect(noChangeReason(g, all, bounds, 'sets')).toMatch(/series o rondas/);
  });

  test('varias semanas y solo la primera lo tiene: es la base', () => {
    const g = gridFromWeeks([{ days: [dayOf(1, 'sentadilla 5x5 @75%')] }, { days: [] }, { days: [] }]);
    expect(noChangeReason(g, all, bounds, 'load')).toMatch(/Solo la semana 1 .*es la base/);
  });

  test('descarga sin volumen escrito', () => {
    const g = gridFromWeeks([{ days: [dayOf(1, 'burpee 1x10')] }, { days: [] }, { days: [] }]);
    expect(noChangeReason(g, all, bounds, 'deload')).toMatch(/volumen escrito/);
  });
});
