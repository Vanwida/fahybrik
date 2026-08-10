// El integrador por intervalo, en seco. Sin base de datos: es una función pura y
// aquí es donde se prueba que un hueco no se rellena y que un duplicado no
// engorda una zona.

import { describe, expect, test } from 'vitest';
import {
  HR_SAMPLE_MAX_INTERVAL_S,
  resolveHrZones,
  timeInZone,
  type AthleteHrZones,
  type HrSampleAt,
} from '@fahybrid/shared/domain/methodology';
import {
  collapseToPolarization,
  DEFAULT_COACH_HR_METHOD,
  hrZoneFractionsFrom,
  polarizationDriftFrom,
  polarizationPct,
  polarizationTargetFrom,
} from '@fahybrid/shared/domain/coach/hr-method';

// Umbral 170 con las bandas de serie: Z1 ≤ 138, Z2 139–150, Z3 151–160,
// Z4 161–173, Z5 por encima.
const ZONES = resolveHrZones({ lthr_bpm: 170 }) as AthleteHrZones;

/** Muestras cada `every` segundos, todas al mismo pulso. */
function steady(bpm: number, from: number, to: number, every: number): HrSampleAt[] {
  const out: HrSampleAt[] = [];
  for (let t = from; t <= to; t += every) out.push({ at_s: t, bpm });
  return out;
}

describe('timeInZone — integrar por intervalo, nunca contar filas', () => {
  test('una serie densa reparte los segundos que de verdad duró la ventana', () => {
    // 600 s a 145 ppm (Z2), muestras cada 5 s como el dato real.
    const r = timeInZone({
      samples: steady(145, 0, 600, 5),
      window_start_s: 0,
      window_end_s: 600,
      zones: ZONES,
    });
    expect(r.by_zone[2]).toBe(600);
    expect(r.classified_s + r.no_hr_s).toBe(600);
    expect(r.no_hr_s).toBe(0);
  });

  test('CONTAR FILAS mentiría: un tramo denso y uno ralo con el mismo pulso pesan lo mismo', () => {
    const denso = timeInZone({
      samples: steady(145, 0, 300, 1),
      window_start_s: 0,
      window_end_s: 300,
      zones: ZONES,
    });
    const ralo = timeInZone({
      samples: steady(145, 0, 300, 10),
      window_start_s: 0,
      window_end_s: 300,
      zones: ZONES,
    });
    // 301 filas contra 31, y los mismos 300 segundos de Z2.
    expect(denso.by_zone[2]).toBe(300);
    expect(ralo.by_zone[2]).toBe(300);
  });

  test('el hueco largo va a «sin pulso» y NO se reparte entre las zonas vecinas', () => {
    // 60 s midiendo, 300 s de silencio, 60 s midiendo. Ventana de 420 s.
    const samples = [...steady(145, 0, 60, 5), ...steady(145, 360, 420, 5)];
    const r = timeInZone({ samples, window_start_s: 0, window_end_s: 420, zones: ZONES });

    // Lo medido: 60 s del primer bloque + el tope de la última muestra antes del
    // silencio + 60 s del segundo + el tope del final, recortado por la ventana.
    expect(r.by_zone[2]).toBeLessThan(200);
    expect(r.no_hr_s).toBeGreaterThan(200);
    expect(r.classified_s + r.no_hr_s).toBe(420);
    // Y ninguna otra banda se ha inventado tiempo por el camino.
    expect(r.by_zone[1]).toBe(0);
    expect(r.by_zone[3]).toBe(0);
  });

  test('una muestra suelta vale como mucho el tope, no la ventana entera', () => {
    const r = timeInZone({
      samples: [{ at_s: 0, bpm: 145 }],
      window_start_s: 0,
      window_end_s: 3600,
      zones: ZONES,
    });
    expect(r.by_zone[2]).toBe(HR_SAMPLE_MAX_INTERVAL_S);
    expect(r.no_hr_s).toBe(3600 - HR_SAMPLE_MAX_INTERVAL_S);
  });

  test('los duplicados del mismo instante no engordan ninguna zona', () => {
    // El caso real: 106.880 lecturas en 46.366 instantes distintos.
    const limpio = steady(145, 0, 300, 5);
    const duplicado = limpio.flatMap((s) => [s, { ...s }, { ...s }]);
    const a = timeInZone({ samples: limpio, window_start_s: 0, window_end_s: 300, zones: ZONES });
    const b = timeInZone({ samples: duplicado, window_start_s: 0, window_end_s: 300, zones: ZONES });
    expect(b).toEqual(a);
  });

  test('las muestras de fuera de la ventana no entran', () => {
    const r = timeInZone({
      samples: [...steady(145, -600, -10, 5), ...steady(145, 0, 60, 5)],
      window_start_s: 0,
      window_end_s: 60,
      zones: ZONES,
    });
    expect(r.classified_s).toBe(60);
    expect(r.classified_s + r.no_hr_s).toBe(60);
  });

  test('SIN ANCLA no se inventa una sola zona: la ventana entera es «sin pulso»', () => {
    const r = timeInZone({
      samples: steady(145, 0, 600, 5),
      window_start_s: 0,
      window_end_s: 600,
      zones: null,
    });
    expect(r.no_hr_s).toBe(600);
    expect(r.classified_s).toBe(0);
    expect(Object.values(r.by_zone).every((s) => s === 0)).toBe(true);
  });

  test('los segundos son enteros y siempre cuadran con la ventana', () => {
    // Cadencia que no divide la ventana: el redondeo tiene que cerrar igual.
    const r = timeInZone({
      samples: [
        { at_s: 0, bpm: 120 },
        { at_s: 3.4, bpm: 145 },
        { at_s: 9.1, bpm: 158 },
        { at_s: 12.7, bpm: 168 },
      ],
      window_start_s: 0,
      window_end_s: 47,
      zones: ZONES,
    });
    for (const s of Object.values(r.by_zone)) expect(Number.isInteger(s)).toBe(true);
    expect(r.classified_s + r.no_hr_s).toBe(47);
  });

  test('una ventana rota (fin antes que inicio) no produce tiempo de la nada', () => {
    const r = timeInZone({
      samples: steady(145, 0, 100, 5),
      window_start_s: 100,
      window_end_s: 100,
      zones: ZONES,
    });
    expect(r.classified_s).toBe(0);
    expect(r.no_hr_s).toBe(0);
  });
});

describe('el método del coach pliega y compara', () => {
  test('el pliegue por defecto es Z1+Z2 fácil, Z3+Z4 medio, Z5 duro', () => {
    const split = collapseToPolarization(
      { 1: 100, 2: 200, 3: 50, 4: 25, 5: 25 },
      DEFAULT_COACH_HR_METHOD,
    );
    expect(split).toEqual({ low: 300, mid: 75, high: 25 });
  });

  test('un coach que sube Z3 al medio-alto obtiene OTRO reparto con los MISMOS segundos', () => {
    const suyo = { ...DEFAULT_COACH_HR_METHOD, polarization_mid_max_zone: 3 };
    const segundos = { 1: 100, 2: 200, 3: 50, 4: 25, 5: 25 } as const;
    expect(collapseToPolarization(segundos, suyo)).toEqual({ low: 300, mid: 50, high: 50 });
  });

  test('los porcentajes suman 100 exactamente aunque el reparto no sea redondo', () => {
    const pct = polarizationPct({ low: 1, mid: 1, high: 1 });
    expect(pct!.low + pct!.mid + pct!.high).toBe(100);
  });

  test('sin un solo segundo clasificado el reparto es null, jamás 0/0/0', () => {
    expect(polarizationPct({ low: 0, mid: 0, high: 0 })).toBeNull();
  });

  test('la desviación se mide contra el objetivo DEL COACH, no contra el nuestro', () => {
    const medido = { low: 60, mid: 20, high: 20 };
    const nuestro = polarizationTargetFrom(DEFAULT_COACH_HR_METHOD);
    const suyo = { low: 60, mid: 20, high: 20 };
    expect(polarizationDriftFrom(medido, nuestro)).toBe(40);
    expect(polarizationDriftFrom(medido, suyo)).toBe(0);
  });

  test('mover el techo de Z2 mueve la banda de verdad, y sin ancla sigue sin haber zonas', () => {
    // Un juego coherente entero, como el que la tabla exige: subir un techo
    // obliga a mover el suelo de la banda siguiente.
    const suyo = {
      ...DEFAULT_COACH_HR_METHOD,
      z1_hi_frac: 0.75,
      z2_lo_frac: 0.76,
      z2_hi_frac: 0.95,
      z3_lo_frac: 0.96,
      z3_hi_frac: 1.0,
      z4_lo_frac: 1.01,
      z4_hi_frac: 1.05,
      z5_lo_frac: 1.06,
      z5_hi_frac: 1.2,
    };
    const conSuyas = resolveHrZones({ lthr_bpm: 170 }, hrZoneFractionsFrom(suyo))!;
    const conLasNuestras = resolveHrZones({ lthr_bpm: 170 })!;
    expect(conSuyas.bands[1]!.max_bpm).toBe(162);
    expect(conLasNuestras.bands[1]!.max_bpm).toBe(150);
    expect(resolveHrZones({}, hrZoneFractionsFrom(suyo))).toBeNull();
  });
});
