// Pure unit tests for shared/domain/running/gradient.ts (#71).
//
// CASOS FABRICADOS A MANO, representando el dominio — el "8×200 en cuesta al
// 8%" de las carreras de referencia contra las que se rompió el modelo, y
// las combinaciones que tienen que devolver null en vez de inventar.

import { describe, expect, test } from 'vitest';
import { netAltitudeChangeM, resolveSegmentGradientPct } from '@fahybrid/shared/domain/running/gradient';

describe('netAltitudeChangeM — cambio NETO, nunca acumulado', () => {
  test('cuesta real: sube 16 m en 200 m — pendiente positiva de un 8×200 al 8%', () => {
    const altitude = { offsets_s: [0, 10, 20, 30, 40], values: [100, 104, 108, 112, 116] };
    expect(netAltitudeChangeM(altitude, 0, 40)).toBe(16);
  });

  test('bajada: pierde altitud — cambio neto negativo', () => {
    const altitude = { offsets_s: [0, 20, 40], values: [200, 190, 180] };
    expect(netAltitudeChangeM(altitude, 0, 40)).toBe(-20);
  });

  test('recorrido ondulado con neto cero: sube y baja, pero el neto es cero — correcto, ahí el ritmo sí significa algo', () => {
    // Sube 10, baja 10 — el ACUMULADO sería 10 (o 20 si sumara valor absoluto),
    // pero el NETO (lo único que aquí importa) es 0.
    const altitude = { offsets_s: [0, 15, 30], values: [100, 110, 100] };
    expect(netAltitudeChangeM(altitude, 0, 30)).toBe(0);
  });

  test('ruido de GPS en tramo llano: el neto se queda cerca de cero, no lo infla el zigzag', () => {
    const altitude = { offsets_s: [0, 10, 20, 30], values: [50, 50.3, 49.8, 50.1] };
    expect(netAltitudeChangeM(altitude, 0, 30)).toBeCloseTo(0.1, 5);
  });

  test('interpola linealmente cuando el borde de la ventana cae ENTRE dos muestras', () => {
    const altitude = { offsets_s: [0, 20], values: [100, 120] }; // 1 m/s de subida
    expect(netAltitudeChangeM(altitude, 5, 15)).toBe(10); // 10 s * 1 m/s
  });

  test('sin cobertura en un extremo: null, nunca cero', () => {
    const altitude = { offsets_s: [0, 10], values: [100, 108] };
    expect(netAltitudeChangeM(altitude, 0, 40)).toBeNull(); // 40 cae fuera de lo cubierto
  });

  test('el borde EXACTO sobre una muestra real no necesita interpolar: el hueco entre muestras no lo invalida', () => {
    // 0 y 200 son muestras REALES, no interpoladas — lo que pasó ENTRE medias
    // no importa para el cambio NETO (ver la cabecera del módulo).
    const altitude = { offsets_s: [0, 200], values: [100, 130] };
    expect(netAltitudeChangeM(altitude, 0, 200)).toBe(30);
  });

  test('hueco de señal mayor que el margen de interpolación: null cuando el borde SÍ necesita interpolar sobre ese hueco', () => {
    const altitude = { offsets_s: [0, 200], values: [100, 130] }; // hueco de 200 s > 120 s
    // Ni 10 ni 190 son muestras reales — las dos caen a mitad del mismo hueco
    // demasiado ancho, así que interpolar sería inventar.
    expect(netAltitudeChangeM(altitude, 10, 190)).toBeNull();
  });

  test('sin ninguna muestra: null', () => {
    expect(netAltitudeChangeM({ offsets_s: [], values: [] }, 0, 30)).toBeNull();
  });
});

describe('resolveSegmentGradientPct — la precedencia del coach', () => {
  test('la cinta manda cuando la hay, aunque también exista una derivada de altitud', () => {
    const res = resolveSegmentGradientPct({ treadmill_incline_pct: 8, altitude_delta_m: 2, distance_m: 200 });
    expect(res).toBe(8); // no la mezcla, no la promedia: gana la cinta tal cual
  });

  test('la cinta declarando LLANO (0) también manda — 0 es un dato real de la máquina', () => {
    const res = resolveSegmentGradientPct({ treadmill_incline_pct: 0, altitude_delta_m: 5, distance_m: 200 });
    expect(res).toBe(0);
  });

  test('sin cinta: cae al cambio neto de altitud sobre la distancia — el 8×200 al 8% real', () => {
    // 16 m de subida en 200 m → 8 %.
    const res = resolveSegmentGradientPct({ treadmill_incline_pct: null, altitude_delta_m: 16, distance_m: 200 });
    expect(res).toBe(8);
  });

  test('sin cinta y sin altitud resuelta: null', () => {
    const res = resolveSegmentGradientPct({ treadmill_incline_pct: null, altitude_delta_m: null, distance_m: 200 });
    expect(res).toBeNull();
  });

  test('sin cinta, con altitud pero sin distancia real: null — no se puede expresar en %', () => {
    const res = resolveSegmentGradientPct({ treadmill_incline_pct: null, altitude_delta_m: 16, distance_m: null });
    expect(res).toBeNull();
    expect(resolveSegmentGradientPct({ treadmill_incline_pct: null, altitude_delta_m: 16, distance_m: 0 })).toBeNull();
  });

  test('bajada derivada de altitud sale negativa, no se fuerza a positivo', () => {
    const res = resolveSegmentGradientPct({ treadmill_incline_pct: null, altitude_delta_m: -10, distance_m: 200 });
    expect(res).toBe(-5);
  });
});
