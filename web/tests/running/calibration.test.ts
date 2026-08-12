// Pure unit tests for shared/domain/running/calibration.ts (#71) — la
// disciplina de muestra es el punto entero del módulo, así que los tests
// centrales son de GATING, no de aritmética feliz.

import { describe, expect, test } from 'vitest';
import { buildRunCalibration, type CalibrationObservation } from '@fahybrid/shared/domain/running/calibration';

const OPTS = { min_series_for_calibration: 20, min_reps_per_position: 3 };

function obs(rep_ordinal: number, verdict: CalibrationObservation['verdict']): CalibrationObservation {
  return { rep_ordinal, verdict };
}

describe('buildRunCalibration — hacia dónde falla', () => {
  test('cuenta las tres direcciones y calcula el % sólo sobre lo evaluable', () => {
    const observations = [
      ...Array.from({ length: 25 }, (_, i) => obs((i % 6) + 1, 'dentro' as const)),
      obs(1, 'fuera_rapido'),
      ...Array.from({ length: 8 }, (_, i) => obs((i % 6) + 1, 'fuera_lento' as const)),
    ];
    const res = buildRunCalibration(observations, OPTS);
    expect(res.bias).toMatchObject({ total: 34, evaluable: 34, dentro: 25, fuera_rapido: 1, fuera_lento: 8 });
    expect(res.bias.pct_dentro).toBe(74); // 25/34 = 73.5 % → redondea a 74
    expect(res.has_enough_data).toBe(true);
  });

  test('sin_dato cuenta en el total pero no en el % — nunca 0 % fabricado', () => {
    const res = buildRunCalibration([obs(1, 'dentro'), obs(2, 'sin_dato'), obs(3, 'sin_dato')], OPTS);
    expect(res.bias).toMatchObject({ total: 3, evaluable: 1, dentro: 1, sin_dato: 2, pct_dentro: 100 });
  });
});

describe('buildRunCalibration — dónde se rompe dentro de la serie', () => {
  test('cada posición lleva su propio n y su propio %, ordenadas ascendente', () => {
    const observations: CalibrationObservation[] = [
      ...Array.from({ length: 7 }, () => obs(1, 'dentro' as const)),
      ...Array.from({ length: 6 }, () => obs(4, 'dentro' as const)),
      obs(4, 'fuera_lento'),
    ];
    const res = buildRunCalibration(observations, OPTS);
    expect(res.positions.map((p) => p.position)).toEqual([1, 4]);
    expect(res.positions[0]).toMatchObject({ position: 1, n: 7, pct_dentro: 100 });
    expect(res.positions[1]).toMatchObject({ position: 4, n: 7, pct_dentro: 86 }); // 6/7
  });

  test('con menos de min_reps_per_position en una posición: se cuenta n, se retira el %', () => {
    // La 6.ª sólo lleva 2 observaciones — mockup: "2 aún", sin porcentaje.
    const observations: CalibrationObservation[] = [obs(6, 'dentro'), obs(6, 'fuera_rapido')];
    const res = buildRunCalibration(observations, OPTS);
    expect(res.positions).toEqual([{ position: 6, n: 2, pct_dentro: null }]);
  });

  test('el mínimo por posición es el que decide el corte, no el mínimo de la tarjeta entera', () => {
    const strict = buildRunCalibration([obs(1, 'dentro'), obs(1, 'dentro')], { ...OPTS, min_reps_per_position: 2 });
    expect(strict.positions[0]!.pct_dentro).toBe(100); // 2 >= 2: sí se atreve
    const loose = buildRunCalibration([obs(1, 'dentro'), obs(1, 'dentro')], { ...OPTS, min_reps_per_position: 3 });
    expect(loose.positions[0]!.pct_dentro).toBeNull(); // 2 < 3: no
  });
});

describe('buildRunCalibration — has_enough_data no esconde los números, sólo marca la bandera', () => {
  test('por debajo del mínimo de series: bias y positions SIGUEN llegando completos', () => {
    const observations = Array.from({ length: 12 }, (_, i) => obs((i % 4) + 1, 'dentro' as const));
    const res = buildRunCalibration(observations, OPTS);
    expect(res.has_enough_data).toBe(false);
    expect(res.min_series_required).toBe(20);
    expect(res.bias.total).toBe(12); // "llevas 12 de 20" — el dato está, la tarjeta decide si lo pinta
    expect(res.positions.length).toBeGreaterThan(0);
  });

  test('cero observaciones: total 0, sin posiciones, nunca un error', () => {
    const res = buildRunCalibration([], OPTS);
    expect(res.has_enough_data).toBe(false);
    expect(res.bias).toMatchObject({ total: 0, evaluable: 0, pct_dentro: null });
    expect(res.positions).toEqual([]);
  });
});
