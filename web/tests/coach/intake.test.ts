import { describe, expect, test } from 'vitest';
import {
  inferLevel,
  proposeBlockSpecs,
  recommendBaselineTests,
} from '@/lib/coach/intake-suggestions';

describe('proposeBlockSpecs', () => {
  // NOTE: proposeBlockSpecs is AGNOSTIC by design — it returns neutral
  // "Microciclo N" placeholders, NEVER a hardcoded phase catalogue. The
  // periodization IS the ORDER + sizing of the microciclos, which the coach owns.
  // These tests pin that sizing logic, not any hardcoded phase label.
  test('long horizon produces 3 microciclos, front-loaded', () => {
    const specs = proposeBlockSpecs(13 * 7);
    expect(specs).toHaveLength(3);
    const total = specs.reduce((s, b) => s + b.weeks, 0);
    expect(total).toBeGreaterThanOrEqual(12);
    expect(total).toBeLessThanOrEqual(14);
    // First microciclo carries at least as much as the last (base-heavy start).
    expect(specs[0].weeks).toBeGreaterThanOrEqual(specs[2].weeks);
  });

  test('compressive horizon (6 weeks) keeps a tiny first microciclo', () => {
    const specs = proposeBlockSpecs(6 * 7);
    expect(specs).toHaveLength(3);
    expect(specs[0].weeks).toBe(1);
  });

  test('very short horizon compresses to 2 microciclos', () => {
    const specs = proposeBlockSpecs(2 * 7);
    // 2 weeks collapses the 3-microciclo shape to 2 (lead-in + event block).
    expect(specs).toHaveLength(2);
    expect(specs.every((b) => b.weeks >= 1)).toBe(true);
  });

  test('zero or negative days falls back to defaults', () => {
    const specs = proposeBlockSpecs(0);
    expect(specs.length).toBeGreaterThan(0);
  });
});

describe('inferLevel', () => {
  test('élite when 3+ years and 2+ benchmarks at élite threshold', () => {
    const level = inferLevel({
      training_experience_years: 5,
      benchmarks: [
        { exercise_slug: 'back_squat_1rm', label: 'BS', value: 140, unit: 'kg' },
        { exercise_slug: 'deadlift_1rm', label: 'DL', value: 180, unit: 'kg' },
        { exercise_slug: 'run_5k', label: '5K', value: 19 * 60 + 42, unit: 's' },
      ],
    });
    expect(level).toBe(3);
  });

  test('competente with experience but no élite hits', () => {
    const level = inferLevel({
      training_experience_years: 3,
      benchmarks: [
        { exercise_slug: 'back_squat_1rm', label: 'BS', value: 115, unit: 'kg' },
        { exercise_slug: 'deadlift_1rm', label: 'DL', value: 145, unit: 'kg' },
        { exercise_slug: 'bench_press_1rm', label: 'BP', value: 85, unit: 'kg' },
      ],
    });
    expect(level).toBe(2);
  });

  test('desarrollo for low experience and no benchmarks', () => {
    const level = inferLevel({ training_experience_years: 0, benchmarks: [] });
    expect(level).toBe(1);
  });

  test('élite (4) when sub-1h HYROX pro declared + 4y experience', () => {
    const level = inferLevel({
      training_experience_years: 5,
      benchmarks: [
        { exercise_slug: 'hyrox_pro', label: 'HYROX', value: 59 * 60, unit: 's' },
        { exercise_slug: 'back_squat_1rm', label: 'BS', value: 150, unit: 'kg' },
      ],
    });
    expect(level).toBe(4);
  });

  test('pro (3) when many élite hits but no HYROX sub-1h', () => {
    const level = inferLevel({
      training_experience_years: 4,
      benchmarks: [
        { exercise_slug: 'back_squat_1rm', label: 'BS', value: 140, unit: 'kg' },
        { exercise_slug: 'deadlift_1rm', label: 'DL', value: 180, unit: 'kg' },
        { exercise_slug: 'run_5k', label: '5K', value: 19 * 60, unit: 's' },
      ],
    });
    expect(level).toBe(3);
  });
});

describe('recommendBaselineTests', () => {
  test('always includes HRV + sleep auto', () => {
    const tests = recommendBaselineTests({ benchmarks: [], is_compressive: false });
    expect(tests.find((t) => t.slug === 'hrv_baseline_7d')).toBeDefined();
    expect(tests.find((t) => t.slug === 'sleep_baseline_7d')).toBeDefined();
  });

  test('includes HYROX simulation only when not compressive', () => {
    const compressive = recommendBaselineTests({ benchmarks: [], is_compressive: true });
    const normal = recommendBaselineTests({ benchmarks: [], is_compressive: false });
    expect(compressive.find((t) => t.slug === 'hyrox_sim_half')).toBeUndefined();
    expect(normal.find((t) => t.slug === 'hyrox_sim_half')).toBeDefined();
  });

  test('includes 1RM battery when 2+ key 1RMs missing', () => {
    const tests = recommendBaselineTests({
      benchmarks: [
        { exercise_slug: 'back_squat_1rm', label: 'BS', value: 140, unit: 'kg' },
      ],
      is_compressive: false,
    });
    expect(tests.find((t) => t.slug === 'one_rm_battery')).toBeDefined();
  });

  test('skips 5K test when endurance benchmark already present', () => {
    const tests = recommendBaselineTests({
      benchmarks: [
        { exercise_slug: 'run_5k', label: '5K', value: 19 * 60, unit: 's' },
      ],
      is_compressive: false,
    });
    expect(tests.find((t) => t.slug === 'endurance_5k')).toBeUndefined();
  });
});
