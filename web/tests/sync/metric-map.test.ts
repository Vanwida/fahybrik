import { describe, expect, it } from 'vitest';
import {
  canonicalizeGarminMetric,
  canonicalizeHealthkitMetric,
} from '@/lib/sync/metric-map';

describe('canonicalizeHealthkitMetric', () => {
  it('maps known metric names', () => {
    expect(canonicalizeHealthkitMetric('heart_rate')).toBe('hr');
    expect(canonicalizeHealthkitMetric('hrv_sdnn')).toBe('hrv');
    expect(canonicalizeHealthkitMetric('vo2_max')).toBe('vo2max');
    expect(canonicalizeHealthkitMetric('active_energy_kcal')).toBe('calories_active');
    expect(canonicalizeHealthkitMetric('body_mass_kg')).toBe('weight');
  });
  it('is case-insensitive', () => {
    expect(canonicalizeHealthkitMetric('Heart_Rate')).toBe('hr');
  });
  it('returns null for unknown metrics', () => {
    expect(canonicalizeHealthkitMetric('walking_steadiness')).toBeNull();
  });
});

describe('canonicalizeGarminMetric', () => {
  it('maps known metric names', () => {
    expect(canonicalizeGarminMetric('hrv')).toBe('hrv');
    expect(canonicalizeGarminMetric('vo2Max')).toBe('vo2max');
    expect(canonicalizeGarminMetric('bodyBattery')).toBe('body_battery');
  });
  it('returns null for unknown metrics', () => {
    expect(canonicalizeGarminMetric('lapType')).toBeNull();
  });
});
