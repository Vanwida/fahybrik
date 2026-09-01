import { describe, expect, test } from 'vitest';
import { storeResultSpecSchema } from '../../../shared/schema/test-battery';
import {
  BENCH_CMJ,
  BENCH_CMJ_LOADED,
  BENCHMARK_UNIT_CM,
  benchmarkLabel,
  benchmarkLowerIsBetter,
  benchmarkMetric,
} from '../../../shared/domain/coach/benchmark-slugs';
import { BASELINE_MEASURE_UNITS, calibrationCoherenceError } from '../../../shared/domain/coach/test-battery';
import { unitForMeasure } from '../../components/v2/tests/draft';

describe('contrato height / cm', () => {
  test('height/cm es baseline y no puede calibrar', () => {
    const ok = storeResultSpecSchema.parse({
      slug: BENCH_CMJ,
      unit: 'cm',
      measure: 'height',
      derives: 'none',
      label: 'CMJ',
    });
    expect(ok.measure).toBe('height');
    expect(calibrationCoherenceError(ok)).toBeNull();
    expect(() =>
      storeResultSpecSchema.parse({
        slug: BENCH_CMJ,
        unit: 'cm',
        measure: 'height',
        derives: 'run_zones',
        label: 'CMJ',
      }),
    ).toThrow();
  });

  test('cm es altura, mayor es mejor', () => {
    expect(benchmarkMetric(BENCHMARK_UNIT_CM)).toBe('height');
    expect(benchmarkLowerIsBetter(BENCHMARK_UNIT_CM)).toBe(false);
    expect(benchmarkLabel(BENCH_CMJ)).toBe('CMJ');
    expect(benchmarkLabel(BENCH_CMJ_LOADED)).toBe('CMJ con carga');
  });

  test('el editor de tests asigna cm a height', () => {
    expect(unitForMeasure('height')).toBe('cm');
    expect(BASELINE_MEASURE_UNITS.some((m) => m.measure === 'height' && m.unit === 'cm')).toBe(true);
  });
});
