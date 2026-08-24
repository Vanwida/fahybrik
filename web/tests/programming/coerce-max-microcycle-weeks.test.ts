import { describe, expect, it } from 'vitest';
import {
  coerceCoachMaxMicrocycleWeeks,
  MICROCICLO_ABSOLUTE_MAX_WEEKS,
  MICROCICLO_DEFAULT_MAX_WEEKS,
} from '@fahybrid/shared/domain/coach/program-months';

describe('coerceCoachMaxMicrocycleWeeks', () => {
  it('deja pasar un tope real del coach', () => {
    expect(coerceCoachMaxMicrocycleWeeks(3)).toBe(3);
    expect(coerceCoachMaxMicrocycleWeeks(8)).toBe(8);
    expect(coerceCoachMaxMicrocycleWeeks(12)).toBe(12);
  });

  it('ausente, no número o fuera de rango → defecto 8', () => {
    expect(coerceCoachMaxMicrocycleWeeks(undefined)).toBe(MICROCICLO_DEFAULT_MAX_WEEKS);
    expect(coerceCoachMaxMicrocycleWeeks(null)).toBe(MICROCICLO_DEFAULT_MAX_WEEKS);
    expect(coerceCoachMaxMicrocycleWeeks('8')).toBe(MICROCICLO_DEFAULT_MAX_WEEKS);
    expect(coerceCoachMaxMicrocycleWeeks(0)).toBe(MICROCICLO_DEFAULT_MAX_WEEKS);
    expect(coerceCoachMaxMicrocycleWeeks(Number.NaN)).toBe(MICROCICLO_DEFAULT_MAX_WEEKS);
  });

  it('recorta al techo absoluto del sistema', () => {
    expect(coerceCoachMaxMicrocycleWeeks(99)).toBe(MICROCICLO_ABSOLUTE_MAX_WEEKS);
  });
});
