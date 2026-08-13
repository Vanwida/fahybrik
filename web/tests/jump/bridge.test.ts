import { describe, expect, test } from 'vitest';
import { benchmarkForTestEvent } from '@fahybrid/shared/domain/athlete/record-test-result';
import { BENCH_CMJ, BENCH_RUN_5K, BENCHMARK_UNIT_CM, BENCHMARK_UNIT_SECONDS } from '@fahybrid/shared/domain/coach/benchmark-slugs';

describe('puente de salto', () => {
  test('jump event writes cm, not seconds', () => {
    const row = benchmarkForTestEvent({
      kind: 'jump',
      athlete_id: 64,
      exercise_slug: BENCH_CMJ,
      height_cm: 47.33,
      source: 'athlete_test',
    });
    expect(row).toEqual({ exercise_slug: BENCH_CMJ, value: 47.33, unit: BENCHMARK_UNIT_CM });
    expect(row.unit).not.toBe(BENCHMARK_UNIT_SECONDS);
  });

  test('un 5K sigue siendo timetrial en segundos', () => {
    const row = benchmarkForTestEvent({
      kind: 'timetrial',
      athlete_id: 64,
      exercise_slug: BENCH_RUN_5K,
      seconds: 1334,
      source: 'coach_test',
    });
    expect(row).toEqual({ exercise_slug: BENCH_RUN_5K, value: 1334, unit: BENCHMARK_UNIT_SECONDS });
  });
});
