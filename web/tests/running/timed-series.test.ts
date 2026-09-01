import { describe, expect, it } from 'vitest';
import {
  MAX_INTERPOLATION_GAP_S,
  toSortedPoints,
  valueAtTime,
  timeAtValue,
} from '@fahybrid/shared/domain/running/timed-series';

// La pieza compartida detrás de `gradient.ts` (altitud en un instante) y
// `route-zones.ts` (velocidad en un instante, y su inversa: en qué instante
// la distancia acumulada cruzó una marca). `gradient.test.ts` ya la ejercita
// indirectamente vía `netAltitudeChangeM` — este fichero prueba las tres
// funciones DIRECTAMENTE, con la misma exigencia que cualquier primitiva
// compartida: sus casos límite no pueden depender de que el módulo que la
// usa los cubra por casualidad.

describe('toSortedPoints', () => {
  it('empareja y ordena por tiempo, aunque llegue desordenado', () => {
    expect(toSortedPoints([20, 0, 10], [2, 0, 1])).toEqual([
      { t: 0, v: 0 },
      { t: 10, v: 1 },
      { t: 20, v: 2 },
    ]);
  });

  it('descarta valores no finitos sin lanzar', () => {
    expect(toSortedPoints([0, 10, 20], [0, NaN, 2])).toEqual([
      { t: 0, v: 0 },
      { t: 20, v: 2 },
    ]);
    expect(toSortedPoints([0, Infinity, 20], [0, 1, 2])).toEqual([
      { t: 0, v: 0 },
      { t: 20, v: 2 },
    ]);
  });

  it('usa la longitud mínima cuando los dos arrays no están alineados', () => {
    expect(toSortedPoints([0, 10, 20], [0, 1])).toEqual([
      { t: 0, v: 0 },
      { t: 10, v: 1 },
    ]);
  });

  it('vacío para dos arrays vacíos', () => {
    expect(toSortedPoints([], [])).toEqual([]);
  });
});

describe('valueAtTime', () => {
  const points = toSortedPoints([0, 100, 220], [10, 20, 26]);

  it('el valor exacto en la primera y la última muestra', () => {
    expect(valueAtTime(points, 0)).toBe(10);
    expect(valueAtTime(points, 220)).toBe(26);
  });

  it('interpola linealmente entre dos muestras', () => {
    // A medio camino entre (0,10) y (100,20): 15.
    expect(valueAtTime(points, 50)).toBeCloseTo(15, 6);
  });

  it('null antes de la primera muestra o después de la última — nunca extrapola', () => {
    expect(valueAtTime(points, -1)).toBeNull();
    expect(valueAtTime(points, 221)).toBeNull();
  });

  it('null cuando el hueco que rodea el instante supera el margen', () => {
    // 220 - 100 = 120 = MAX_INTERPOLATION_GAP_S exacto — no supera, interpola.
    expect(MAX_INTERPOLATION_GAP_S).toBe(120);
    expect(valueAtTime(points, 160)).not.toBeNull();
    // Un hueco de 121 s SÍ supera el margen.
    const withBigGap = toSortedPoints([0, 100, 221], [10, 20, 26]);
    expect(valueAtTime(withBigGap, 160)).toBeNull();
  });

  it('null con cero muestras', () => {
    expect(valueAtTime([], 10)).toBeNull();
  });

  it('la única muestra sirve de primera y última a la vez', () => {
    const one = toSortedPoints([50], [7]);
    expect(valueAtTime(one, 50)).toBe(7);
    expect(valueAtTime(one, 49)).toBeNull();
  });
});

describe('timeAtValue', () => {
  // Una señal ACUMULATIVA (distancia): crece con el tiempo.
  const distance = toSortedPoints([0, 50, 100, 230], [0, 500, 1000, 2000]);

  it('interpola el instante entre dos muestras cuando la marca cae entre ellas', () => {
    // 750 está a medio camino entre 500 (t=50) y 1000 (t=100) → t=75.
    expect(timeAtValue(distance, 750)).toBeCloseTo(75, 6);
  });

  it('el cruce EXACTO en una muestra no necesita interpolar', () => {
    expect(timeAtValue(distance, 500)).toBe(50);
  });

  it('null cuando la marca cae antes de, o exactamente en, la primera muestra', () => {
    // No hay muestra ANTERIOR de la que interpolar hacia atrás.
    expect(timeAtValue(distance, 0)).toBeNull();
    expect(timeAtValue(distance, -10)).toBeNull();
  });

  it('null cuando la marca nunca se alcanza', () => {
    expect(timeAtValue(distance, 5000)).toBeNull();
  });

  it('null cuando el hueco alrededor del cruce supera el margen', () => {
    // 100→230 son 130 s, por encima de MAX_INTERPOLATION_GAP_S (120).
    expect(timeAtValue(distance, 1500)).toBeNull();
  });

  it('un hueco de exactamente 120 s SÍ interpola — el límite es inclusivo', () => {
    const exact120 = toSortedPoints([0, 50, 170], [0, 500, 1500]);
    expect(timeAtValue(exact120, 1000)).not.toBeNull();
  });

  it('null con cero muestras', () => {
    expect(timeAtValue([], 100)).toBeNull();
  });

  it('una señal estancada (dos muestras con el mismo valor) no divide por cero', () => {
    const flat = toSortedPoints([0, 50, 100], [0, 500, 500]);
    // La marca 500 se alcanza ya en t=50 — el primer punto que la cumple.
    expect(timeAtValue(flat, 500)).toBe(50);
  });
});
