// Los umbrales del coach (shared/domain/coach/signal-thresholds) — método como
// dato con defecto (HARD RULE Nº0). El PUT es por campo; null vuelve al defecto.

import { describe, expect, it } from 'vitest';
import {
  COACH_THRESHOLD_KEYS,
  COACH_THRESHOLD_SPEC,
  DEFAULT_COACH_THRESHOLDS,
  mergeCoachThresholds,
  readinessBandOf,
  thresholdIssues,
} from '@fahybrid/shared/domain/coach/signal-thresholds';
import { coachSignalThresholdsPutSchema } from '@fahybrid/shared/schema/coach-signal-thresholds';
import { SIGNAL_THRESHOLDS, signalThresholdsSchema } from '@/lib/coach/signal-config';

describe('COACH_THRESHOLD_SPEC', () => {
  it('cada defecto cae dentro de sus límites', () => {
    for (const k of COACH_THRESHOLD_KEYS) {
      const s = COACH_THRESHOLD_SPEC[k];
      expect(s.default, k).toBeGreaterThanOrEqual(s.min);
      expect(s.default, k).toBeLessThanOrEqual(s.max);
    }
  });

  it('los defectos son coherentes entre sí', () => {
    expect(thresholdIssues(DEFAULT_COACH_THRESHOLDS)).toEqual([]);
  });

  it('el registro del motor lleva todos los editables y valida', () => {
    for (const k of COACH_THRESHOLD_KEYS) expect(SIGNAL_THRESHOLDS[k]).toBe(DEFAULT_COACH_THRESHOLDS[k]);
    expect(() => signalThresholdsSchema.parse(SIGNAL_THRESHOLDS)).not.toThrow();
  });
});

describe('mergeCoachThresholds', () => {
  it('null o ausente = defecto; número = el del coach', () => {
    const t = mergeCoachThresholds({ readiness_critical_floor: 30, missed_sessions_min: null });
    expect(t.readiness_critical_floor).toBe(30);
    expect(t.missed_sessions_min).toBe(DEFAULT_COACH_THRESHOLDS.missed_sessions_min);
    expect(mergeCoachThresholds(null)).toEqual(DEFAULT_COACH_THRESHOLDS);
  });
});

describe('thresholdIssues', () => {
  it('cautela por encima de bien, o suelo por encima de bien → incoherente', () => {
    const bad = mergeCoachThresholds({ readiness_caution_min: 70, readiness_critical_floor: 80 });
    expect(thresholdIssues(bad).map((i) => i.key)).toEqual(['readiness_caution_min', 'readiness_critical_floor']);
  });
});

describe('readinessBandOf', () => {
  it('pinta con las bandas del coach', () => {
    expect(readinessBandOf(67)).toBe('ok');
    expect(readinessBandOf(45)).toBe('caution');
    expect(readinessBandOf(44)).toBe('low');
    expect(readinessBandOf(60, { readiness_ok_min: 60, readiness_caution_min: 40 })).toBe('ok');
  });
});

describe('coachSignalThresholdsPutSchema', () => {
  it('acepta un solo campo, y null para volver al defecto', () => {
    expect(coachSignalThresholdsPutSchema.safeParse({ readiness_drop_points: 20 }).success).toBe(true);
    expect(coachSignalThresholdsPutSchema.safeParse({ readiness_drop_points: null }).success).toBe(true);
  });

  it('sigue aceptando el trío de la tarjeta vieja', () => {
    expect(
      coachSignalThresholdsPutSchema.safeParse({
        communication_question_unanswered_days: 2,
        communication_task_overdue_critical_days: 3,
        communication_protocol_unopened_days: 3,
      }).success,
    ).toBe(true);
  });

  it('rechaza fuera de límites, claves desconocidas y cuerpo vacío', () => {
    expect(coachSignalThresholdsPutSchema.safeParse({ rpe_high_min: 11 }).success).toBe(false);
    expect(coachSignalThresholdsPutSchema.safeParse({ readiness_drop_days: 1.5 }).success).toBe(false);
    expect(coachSignalThresholdsPutSchema.safeParse({ foo: 1 }).success).toBe(false);
    expect(coachSignalThresholdsPutSchema.safeParse({}).success).toBe(false);
  });
});
