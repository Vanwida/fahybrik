// El método del coach ampliado (shared/domain/analytics/metodo.ts, 0277): los
// defectos son el comportamiento de hoy, y lo incoherente no entra ni por la
// validación pura ni por el esquema zod del editor.

import { describe, expect, test } from 'vitest';
import {
  ANALYTICS_METHOD_BOUNDS,
  COACH_ANALYTICS_METHOD_FAMILY_KEYS,
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
    // 0279: el reparto de intensidad, sin la fuerza ni «otro», con 10 puntos de holgura.
    expect(m.polarizacion_familias).toEqual(['correr', 'remo', 'ski', 'bici', 'estaciones', 'wod']);
    expect([m.polarizacion_tolerancia_pts, m.cambio_polarizacion_pts]).toEqual([10, 5]);
  });

  test('la copia fresca no comparte las listas con el defecto', () => {
    const m = defaultCoachAnalyticsMethod();
    m.fuentes_run.push('esfuerzo');
    m.polarizacion_familias.push('fuerza');
    expect(DEFAULT_COACH_ANALYTICS_METHOD.fuentes_run).toHaveLength(3);
    expect(DEFAULT_COACH_ANALYTICS_METHOD.polarizacion_familias).toHaveLength(6);
  });

  test('las claves se reparten sin solapes entre numéricas, listas, conjuntos de familias y textos', () => {
    const listas = COACH_ANALYTICS_METHOD_LIST_KEYS as readonly string[];
    const familias = COACH_ANALYTICS_METHOD_FAMILY_KEYS as readonly string[];
    expect(COACH_ANALYTICS_METHOD_NUMERIC_KEYS.some((k) => listas.includes(k) || familias.includes(k))).toBe(false);
    expect(COACH_ANALYTICS_METHOD_NUMERIC_KEYS.length + listas.length + familias.length + 1).toBe(COACH_ANALYTICS_METHOD_KEYS.length);
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

  test('un reparto de intensidad vacío, con una familia repetida o inventada', () => {
    expect(validarMetodoAnalitico({ ...defaultCoachAnalyticsMethod(), polarizacion_familias: [] })).toEqual([expect.stringMatching(/al menos una familia/)]);
    expect(validarMetodoAnalitico({ ...defaultCoachAnalyticsMethod(), polarizacion_familias: ['correr', 'correr'] })).toEqual([expect.stringMatching(/repite una familia/)]);
    expect(
      validarMetodoAnalitico({ ...defaultCoachAnalyticsMethod(), polarizacion_familias: ['nadar' as never] }),
    ).toEqual([expect.stringMatching(/no es una familia/)]);
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
    expect(analyticsMethodSchema.safeParse({ ...defaultCoachAnalyticsMethod(), polarizacion_familias: ['nadar'] }).success).toBe(false);
    expect(analyticsMethodSchema.safeParse({ ...defaultCoachAnalyticsMethod(), polarizacion_tolerancia_pts: 0 }).success).toBe(false);
    const r = analyticsMethodSchema.safeParse({ ...defaultCoachAnalyticsMethod(), atl_days: 20, ctl_days: 14 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toMatch(/reciente/);
  });
});
