import { describe, expect, test } from 'vitest';
import { DEFAULT_CALIBRATION_BATTERY, calibrationCoherenceError } from '../../../shared/domain/coach/test-battery';
import { TEST_FAMILY_ORDER, TEST_PRESETS_BY_FAMILY } from '../../../shared/domain/coach/test-catalog';
import {
  CMJ_PROFILE_SLUG,
  captureModeForSpecs,
  isJumpVideoCapture,
} from '../../../shared/domain/jump/protocol';

describe('protocolo cmj_profile', () => {
  const proto = DEFAULT_CALIBRATION_BATTERY.find((p) => p.slug === CMJ_PROFILE_SLUG);

  test('existe, no va a semana 1, no calibra', () => {
    expect(proto).toBeDefined();
    expect(proto!.week_offset).toBeNull();
    expect(proto!.day_of_week).toBeNull();
    expect(proto!.store_results.every((s) => s.measure === 'height' && s.derives === 'none')).toBe(true);
    for (const s of proto!.store_results) {
      expect(calibrationCoherenceError(s)).toBeNull();
    }
  });

  test('no lleva hrr — un salto no es un esfuerzo de resistencia', () => {
    expect(proto!.store_results.some((s) => s.slug === 'hrr60')).toBe(false);
  });

  test('capture se decide por measure height, no por slug', () => {
    expect(isJumpVideoCapture(proto!.store_results)).toBe(true);
    expect(captureModeForSpecs(proto!.store_results)).toBe('jump_video');
    expect(captureModeForSpecs([{ measure: 'time' }])).toBe('session');
  });

  test('el catálogo del coach tiene la familia Saltos', () => {
    expect(TEST_FAMILY_ORDER).toContain('saltos');
    expect(TEST_PRESETS_BY_FAMILY.saltos).toHaveLength(1);
    expect(TEST_PRESETS_BY_FAMILY.saltos[0]!.results?.length).toBe(2);
  });
});
