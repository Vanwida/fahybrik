import { describe, expect, test } from 'vitest';
import { inferLevel } from '@/lib/coach/intake-suggestions';
// Los tests del alta ya no salen de una lista cableada (HRV, simulación HYROX,
// 1RM, 5 km): son la batería del coach (`listCoachTests`). Ver
// tests/coach/intake-plan-personal.db.test.ts.

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
