// The box-standing math (mockup marcas-ranking) — pinned where it can lie silently.
import { describe, expect, it } from 'vitest';
import { MIN_POOL_FOR_PERCENTILE, HISTOGRAM_BUCKETS } from '../../lib/athlete/marks-box';

describe('the honest-start floor', () => {
  it('is 10 comparables — below it a percentile is a rank in a costume', () => {
    expect(MIN_POOL_FOR_PERCENTILE).toBe(10);
  });
  it('the strip matches the mockup resolution', () => {
    expect(HISTOGRAM_BUCKETS).toBe(11);
  });
});
