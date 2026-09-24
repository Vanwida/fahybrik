import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_RETEST_WEEKS,
  effectiveTestRetestWeeks,
  testRetestOptions,
} from '@fahybrid/shared/domain/coach/test-cadence';

describe('cadencia de re-test (método del coach con defecto)', () => {
  it('sin dato del coach → el defecto', () => {
    expect(effectiveTestRetestWeeks(null)).toEqual([...DEFAULT_TEST_RETEST_WEEKS]);
    expect(effectiveTestRetestWeeks([0, 99, 2.5])).toEqual([...DEFAULT_TEST_RETEST_WEEKS]);
  });
  it('lo del coach, limpio: enteros 1–52, sin repetir, ordenado, como mucho 4', () => {
    expect(effectiveTestRetestWeeks([10, 4, 4, 8, 52, 20])).toEqual([4, 8, 10, 20]);
  });
  it('opciones del selector', () => {
    expect(testRetestOptions([1, 8])).toEqual([
      { label: 'No repetir', weeks: 0 },
      { label: 'En 1 semana', weeks: 1 },
      { label: 'En 8 semanas', weeks: 8 },
    ]);
  });
});
