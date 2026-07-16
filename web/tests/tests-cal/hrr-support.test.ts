import { describe, expect, it } from 'vitest';
import { benchmarkForTestEvent } from '@fahybrid/shared/domain/athlete/record-test-result';
import {
  BENCH_HRR_60,
  benchmarkLowerIsBetter,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { storeResultsSchema } from '@fahybrid/shared/schema/test-battery';

// #34 follow-up — HRR (heart-rate recovery) support (pure, no DB). Pins the
// direction-of-improvement rule + the benchmark mapping + the contract schema, so
// the bridge/history/deltas all agree without a database.

describe('HRR benchmark mapping', () => {
  it('an hrr event records the bpm drop under its slug, in bpm', () => {
    const row = benchmarkForTestEvent({
      kind: 'hrr',
      athlete_id: 1,
      exercise_slug: BENCH_HRR_60,
      bpm: 34,
      source: 'athlete_test',
    });
    expect(row).toEqual({ exercise_slug: 'hrr60', value: 34, unit: 'bpm' });
  });
});

describe('benchmarkLowerIsBetter — the single improvement-direction rule', () => {
  it('only TIME (seconds) improves downward; everything else improves upward', () => {
    expect(benchmarkLowerIsBetter('seconds')).toBe(true);
    expect(benchmarkLowerIsBetter('kg')).toBe(false);
    expect(benchmarkLowerIsBetter('bpm')).toBe(false); // more HR recovery = fitter
    expect(benchmarkLowerIsBetter('reps')).toBe(false);
    expect(benchmarkLowerIsBetter('meters')).toBe(false);
    expect(benchmarkLowerIsBetter('calories')).toBe(false);
  });
});

describe('store_results contract admits HRR as a baseline', () => {
  it('accepts measure hrr / unit bpm with derives none', () => {
    const parsed = storeResultsSchema.safeParse([
      { slug: 'hrr60', measure: 'hrr', unit: 'bpm', derives: 'none', label: 'Recuperación FC 60s' },
    ]);
    expect(parsed.success).toBe(true);
  });

  it('rejects an HRR result that claims to calibrate (only time/load may)', () => {
    const parsed = storeResultsSchema.safeParse([
      { slug: 'hrr60', measure: 'hrr', unit: 'bpm', derives: 'run_zones', modality: 'run', label: 'X' },
    ]);
    expect(parsed.success).toBe(false);
  });
});
