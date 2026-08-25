/**
 * Card 128 · hueco 6. Contrato de ENTREGA del importador de ciclo:
 * tramo, techo, trinquete de cobertura (71 % del corpus).
 */
import { describe, expect, test } from 'vitest';
import {
  CYCLE_IMPORT_COVERAGE_RATCHET_PCT,
  CYCLE_IMPORT_STRETCH_MAX,
  coverageAllowsConfirm,
  coveragePct,
  coverageRefuseMessage,
  sliceCycleWeeks,
} from '@fahybrid/shared/domain/import/cycle-delivery';

describe('cobertura del trinquete (71 % del corpus, no un número inventado)', () => {
  test('el trinquete ES el del banco del corpus', () => {
    expect(CYCLE_IMPORT_COVERAGE_RATCHET_PCT).toBe(71);
  });

  test('884 de 1.238 = 71 % y confirma', () => {
    const summary = { total_items: 1238, detected: 884 };
    expect(coveragePct(summary)).toBe(71);
    expect(coverageAllowsConfirm(summary)).toBe(true);
  });

  test('por debajo del trinquete se niega, aunque haya líneas tipadas', () => {
    const summary = { total_items: 100, detected: 70 };
    expect(coveragePct(summary)).toBe(70);
    expect(coverageAllowsConfirm(summary)).toBe(false);
    expect(coverageRefuseMessage(summary)).toContain('70 %');
    expect(coverageRefuseMessage(summary)).toContain('71 %');
  });

  test('sin líneas no hay cobertura que confirmar', () => {
    expect(coverageAllowsConfirm({ total_items: 0, detected: 0 })).toBe(false);
  });
});

describe('tramo y techo', () => {
  const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((week) => ({ week }));

  test('sin rango, 12 semanas se niegan: hay que elegir tramo', () => {
    const r = sliceCycleWeeks({ weeks });
    expect('code' in r && r.code).toBe('over_ceiling');
  });

  test('semanas 1 a 6 caben en el techo', () => {
    const r = sliceCycleWeeks({ weeks, week_from: 1, week_to: 6 });
    expect('weeks' in r).toBe(true);
    if ('weeks' in r) {
      expect(r.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(r.week_from).toBe(1);
      expect(r.week_to).toBe(6);
    }
  });

  test('7 semanas pasan el techo', () => {
    const r = sliceCycleWeeks({ weeks, week_from: 1, week_to: 7 });
    expect('code' in r && r.code).toBe('over_ceiling');
    if ('code' in r) expect(r.message).toContain(String(CYCLE_IMPORT_STRETCH_MAX));
  });

  test('un documento corto sin rango entra entero', () => {
    const r = sliceCycleWeeks({ weeks: [{ week: 1 }, { week: 2 }] });
    expect('weeks' in r && r.weeks).toHaveLength(2);
  });

  test('un tramo que no existe se dice, no se adivina', () => {
    const r = sliceCycleWeeks({ weeks: [{ week: 1 }], week_from: 8, week_to: 12 });
    expect('code' in r && r.code).toBe('unknown_weeks');
  });
});
