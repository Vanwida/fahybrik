// El método de los motores secundarios es dato del coach (0256, HARD RULE Nº0):
// pesos relativos que se normalizan, coherencia entre campos, y cada clave con su
// castellano y su sección en Ajustes › Método.

import { describe, expect, it } from 'vitest';
import {
  COACH_THRESHOLD_KEYS,
  DEFAULT_COACH_THRESHOLDS,
  mergeCoachThresholds,
  normalizedWeights,
  thresholdIssues,
  weightGroupOf,
} from '@fahybrid/shared/domain/coach/signal-thresholds';
import { THRESHOLD_COPY, THRESHOLD_SECTIONS } from '@/components/v2/ajustes/threshold-copy';

describe('pesos relativos', () => {
  it('los defectos son los números de siempre y suman 1 normalizados', () => {
    const r = normalizedWeights(DEFAULT_COACH_THRESHOLDS, 'readiness')!;
    expect(r.readiness_weight_checkin).toBeCloseTo(0.35);
    expect(r.readiness_weight_hrv).toBeCloseTo(0.25);
    expect(r.readiness_weight_sleep).toBeCloseTo(0.2);
    expect(Object.values(r).reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    const d = normalizedWeights(DEFAULT_COACH_THRESHOLDS, 'race_readiness')!;
    expect(d.race_readiness_weight_freshness).toBeCloseTo(0.4);
    expect(Object.values(d).reduce((s, v) => s + v, 0)).toBeCloseTo(1);
  });

  it('un coach que cambia un peso no rompe la suma: se reparte', () => {
    const t = mergeCoachThresholds({ readiness_weight_checkin: 70 });
    const r = normalizedWeights(t, 'readiness')!;
    expect(Object.values(r).reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    expect(r.readiness_weight_checkin).toBeCloseTo(70 / 135);
    expect(thresholdIssues(t)).toEqual([]);
  });

  it('un grupo entero a cero es incoherente', () => {
    const t = mergeCoachThresholds({
      race_readiness_weight_freshness: 0,
      race_readiness_weight_adherence: 0,
      race_readiness_weight_hrv: 0,
      race_readiness_weight_activity: 0,
    });
    expect(normalizedWeights(t, 'race_readiness')).toBeNull();
    expect(thresholdIssues(t).map((i) => i.key)).toContain('race_readiness_weight_freshness');
  });

  it('weightGroupOf solo reconoce pesos', () => {
    expect(weightGroupOf('readiness_weight_rhr')).toBe('readiness');
    expect(weightGroupOf('race_readiness_weight_activity')).toBe('race_readiness');
    expect(weightGroupOf('race_readiness_tsb_span')).toBeNull();
  });
});

describe('coherencia de «Listo para progresar»', () => {
  it('el ACWR de infraentrenado tiene que quedar por debajo del de sobrecarga', () => {
    const t = mergeCoachThresholds({ progress_acr_low_pct: 100, progress_acr_high_pct: 100 });
    expect(thresholdIssues(t).map((i) => i.key)).toContain('progress_acr_low_pct');
  });
});

describe('Ajustes › Método', () => {
  it('cada clave tiene su castellano y está en una sola sección', () => {
    const seen = new Map<string, number>();
    for (const s of THRESHOLD_SECTIONS) for (const k of s.keys) seen.set(k, (seen.get(k) ?? 0) + 1);
    for (const k of COACH_THRESHOLD_KEYS) {
      expect(THRESHOLD_COPY[k]?.label, k).toBeTruthy();
      expect(seen.get(k), k).toBe(1);
    }
  });
});
