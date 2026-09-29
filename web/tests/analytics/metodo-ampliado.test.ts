// El método del coach ampliado (shared/domain/analytics/metodo.ts, 0277): los
// defectos son el comportamiento de hoy, y lo incoherente no entra ni por la
// validación pura ni por el esquema zod del editor.

import { describe, expect, test } from 'vitest';
import {
  ANALYTICS_METHOD_BOUNDS,
  COACH_ANALYTICS_METHOD_KEYS,
  COACH_ANALYTICS_METHOD_LIST_KEYS,
  COACH_ANALYTICS_METHOD_NUMERIC_KEYS,
  DEFAULT_COACH_ANALYTICS_METHOD,
  defaultCoachAnalyticsMethod,
  validarMetodoAnalitico,
} from '@fahybrid/shared/domain/analytics/metodo';
import { analyticsMethodPutSchema, analyticsMethodSchema } from '@fahybrid/shared/domain/methodology/method-editors';
import { LOAD_COVERAGE_MIN } from '@fahybrid/shared/domain/training-load/coverage';

describe('los defectos', () => {
  test('son coherentes y todos los numéricos caen dentro de sus límites', () => {
    const m = defaultCoachAnalyticsMethod();
    expect(validarMetodoAnalitico(m)).toEqual([]);
    for (const k of COACH_ANALYTICS_METHOD_NUMERIC_KEYS) {
      const b = ANALYTICS_METHOD_BOUNDS[k];
      expect(m[k], k).toBeGreaterThanOrEqual(b.min);
      expect(m[k], k).toBeLessThanOrEqual(b.max);
    }
  });

  test('son EXACTAMENTE lo de hoy: 42/7, 90 % de cobertura, bandas de mercado, 60→14 de basal', () => {
    const m = DEFAULT_COACH_ANALYTICS_METHOD;
    expect([m.ctl_days, m.atl_days]).toEqual([42, 7]);
    expect(m.cobertura_veredicto_min_pct).toBe(LOAD_COVERAGE_MIN * 100);
    expect([m.frescura_sobrecarga_hasta, m.frescura_optimo_hasta, m.frescura_mantener_hasta, m.frescura_fresco_hasta]).toEqual([-30, -11, 4, 29]);
    expect([m.basal_dias, m.basal_excluir_dias]).toEqual([60, 14]);
    expect(m.fuentes_run).toEqual(['ritmo', 'pulso', 'esfuerzo']);
    expect(m.fuentes_row).toEqual(['potencia', 'pulso', 'esfuerzo']);
    expect(m.fuentes_strength).toEqual(['esfuerzo', 'pulso']);
    expect(m.fuerza_coeficiente).toBe(1);
  });

  test('la copia fresca no comparte las listas con el defecto', () => {
    const m = defaultCoachAnalyticsMethod();
    m.fuentes_run.push('esfuerzo');
    expect(DEFAULT_COACH_ANALYTICS_METHOD.fuentes_run).toHaveLength(3);
  });

  test('las claves se reparten sin solapes entre numéricas, listas y textos', () => {
    const listas = COACH_ANALYTICS_METHOD_LIST_KEYS as readonly string[];
    expect(COACH_ANALYTICS_METHOD_NUMERIC_KEYS.some((k) => listas.includes(k))).toBe(false);
    expect(COACH_ANALYTICS_METHOD_NUMERIC_KEYS.length + listas.length + 1).toBe(COACH_ANALYTICS_METHOD_KEYS.length);
  });
});

describe('validarMetodoAnalitico', () => {
  test('bandas de frescura desordenadas', () => {
    const m = { ...defaultCoachAnalyticsMethod(), frescura_optimo_hasta: 10, frescura_mantener_hasta: 4 };
    expect(validarMetodoAnalitico(m)).toEqual([expect.stringMatching(/bandas de frescura/)]);
  });

  test('regular por encima de bien; basal excluido mayor que el basal', () => {
    expect(validarMetodoAnalitico({ ...defaultCoachAnalyticsMethod(), cumplimiento_regular_pct: 95 })).toEqual([expect.stringMatching(/regular/)]);
    expect(validarMetodoAnalitico({ ...defaultCoachAnalyticsMethod(), basal_excluir_dias: 60 })).toEqual([expect.stringMatching(/basal/)]);
  });

  test('una escalera vacía, repetida o con un peldaño que esa modalidad no puede preciar', () => {
    expect(validarMetodoAnalitico({ ...defaultCoachAnalyticsMethod(), fuentes_run: [] })).toEqual([expect.stringMatching(/al menos un peldaño/)]);
    expect(validarMetodoAnalitico({ ...defaultCoachAnalyticsMethod(), fuentes_run: ['pulso', 'pulso'] })).toEqual([expect.stringMatching(/repite/)]);
    expect(validarMetodoAnalitico({ ...defaultCoachAnalyticsMethod(), fuentes_run: ['potencia'] })).toEqual([expect.stringMatching(/no se puede preciar por potencia/)]);
    expect(validarMetodoAnalitico({ ...defaultCoachAnalyticsMethod(), fuentes_row: ['ritmo'] })).toEqual([expect.stringMatching(/no se puede preciar por ritmo/)]);
  });
});

describe('el esquema del editor', () => {
  test('acepta los defectos y el conjunto entero; `null` es volver a los defectos', () => {
    expect(analyticsMethodSchema.safeParse(defaultCoachAnalyticsMethod()).success).toBe(true);
    expect(analyticsMethodPutSchema.safeParse({ method: null }).success).toBe(true);
  });

  test('rechaza un campo de más, uno fuera de rango, un peldaño inventado y la incoherencia entre campos', () => {
    expect(analyticsMethodSchema.safeParse({ ...defaultCoachAnalyticsMethod(), extra: 1 }).success).toBe(false);
    expect(analyticsMethodSchema.safeParse({ ...defaultCoachAnalyticsMethod(), ctl_days: 5 }).success).toBe(false);
    expect(analyticsMethodSchema.safeParse({ ...defaultCoachAnalyticsMethod(), fuentes_run: ['vatios'] }).success).toBe(false);
    expect(analyticsMethodSchema.safeParse({ ...defaultCoachAnalyticsMethod(), cumplimiento_base: 'otra' }).success).toBe(false);
    const r = analyticsMethodSchema.safeParse({ ...defaultCoachAnalyticsMethod(), atl_days: 20, ctl_days: 14 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toMatch(/reciente/);
  });
});

describe('el método del cumplimiento (0281)', () => {
  test('los defectos: la escalera y las bandas de mercado, la holgura del vivo, 10 puntos de cambio', () => {
    const m = DEFAULT_COACH_ANALYTICS_METHOD;
    expect(m.cumplimiento_sesion_bases).toEqual(['carga', 'duracion', 'distancia']);
    expect([m.cumplimiento_verde_min_pct, m.cumplimiento_verde_max_pct, m.cumplimiento_ambar_min_pct, m.cumplimiento_ambar_max_pct]).toEqual([80, 120, 50, 150]);
    expect([m.holgura_ritmo_s_km, m.holgura_split_s_500m, m.holgura_vatios_w, m.holgura_pulso_ppm]).toEqual([3, 2, 10, 2]);
    expect([m.holgura_rpe, m.holgura_rir, m.holgura_carga_pct, m.holgura_dosis_pct]).toEqual([1, 1, 0, 10]);
    expect(m.cambio_cumplimiento_pts).toBe(10);
    expect(COACH_ANALYTICS_METHOD_LIST_KEYS).toContain('cumplimiento_sesion_bases');
  });

  test('las bandas de una sesión van en orden y la verde contiene el 100 %', () => {
    const base = defaultCoachAnalyticsMethod();
    expect(validarMetodoAnalitico({ ...base, cumplimiento_ambar_min_pct: 80 })).toEqual([expect.stringMatching(/bandas de una sesión/)]);
    expect(validarMetodoAnalitico({ ...base, cumplimiento_verde_max_pct: 150 })).toEqual([expect.stringMatching(/bandas de una sesión/)]);
    expect(validarMetodoAnalitico({ ...base, cumplimiento_verde_min_pct: 90, cumplimiento_verde_max_pct: 110, cumplimiento_ambar_min_pct: 60, cumplimiento_ambar_max_pct: 140 })).toEqual([]);
  });

  test('las bases de una sesión: al menos una, sin repetir, del vocabulario', () => {
    const base = defaultCoachAnalyticsMethod();
    expect(validarMetodoAnalitico({ ...base, cumplimiento_sesion_bases: [] })).toEqual([expect.stringMatching(/al menos una base/)]);
    expect(validarMetodoAnalitico({ ...base, cumplimiento_sesion_bases: ['carga', 'carga'] })).toEqual([expect.stringMatching(/repiten/)]);
    expect(validarMetodoAnalitico({ ...base, cumplimiento_sesion_bases: ['distancia'] })).toEqual([]);
    expect(analyticsMethodSchema.safeParse({ ...base, cumplimiento_sesion_bases: ['tss'] }).success).toBe(false);
    expect(analyticsMethodSchema.safeParse({ ...base, cumplimiento_sesion_bases: ['duracion', 'carga'] }).success).toBe(true);
  });

  test('las holguras dentro de sus límites', () => {
    const base = defaultCoachAnalyticsMethod();
    expect(analyticsMethodSchema.safeParse({ ...base, holgura_ritmo_s_km: 31 }).success).toBe(false);
    expect(analyticsMethodSchema.safeParse({ ...base, holgura_rir: 0.5 }).success).toBe(true);
    expect(analyticsMethodSchema.safeParse({ ...base, holgura_dosis_pct: -1 }).success).toBe(false);
  });

  test('la copia fresca no comparte la escalera de bases con el defecto', () => {
    const m = defaultCoachAnalyticsMethod();
    m.cumplimiento_sesion_bases.pop();
    expect(DEFAULT_COACH_ANALYTICS_METHOD.cumplimiento_sesion_bases).toHaveLength(3);
  });
});
