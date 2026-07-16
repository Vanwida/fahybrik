import { describe, expect, it } from 'vitest';
import { benchmarkForTestEvent } from '@fahybrid/shared/domain/athlete/record-test-result';
import {
  BENCH_HRR_60,
  benchmarkLowerIsBetter,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { storeResultsSchema } from '@fahybrid/shared/schema/test-battery';
import { DEFAULT_CALIBRATION_BATTERY } from '@fahybrid/shared/domain/coach/test-battery';

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

  it('accepts the optional flag on a spec', () => {
    const parsed = storeResultsSchema.safeParse([
      { slug: 'hrr60', measure: 'hrr', unit: 'bpm', derives: 'none', label: 'HRR', optional: true },
    ]);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data[0]!.optional).toBe(true);
  });
});

describe('hrr60 seeded OPTIONAL on the resistance defaults (not the 1RM battery)', () => {
  const byPrimary = new Map(DEFAULT_CALIBRATION_BATTERY.map((p) => [p.primary_modality, p]));

  it('5K, 2K row and half-sim each carry an OPTIONAL hrr60 (bpm baseline)', () => {
    for (const mod of ['run', 'row', 'hyrox'] as const) {
      const p = byPrimary.get(mod)!;
      const hrr = p.store_results.find((r) => r.slug === 'hrr60');
      expect(hrr, `${mod} debe llevar hrr60`).toBeTruthy();
      expect(hrr!.optional).toBe(true);
      expect(hrr!.measure).toBe('hrr');
      expect(hrr!.unit).toBe('bpm');
      expect(hrr!.derives).toBe('none');
    }
  });

  it('the 1RM battery has NO hrr60 (HRR tras fuerza no es estándar)', () => {
    expect(byPrimary.get('strength')!.store_results.some((r) => r.slug === 'hrr60')).toBe(false);
  });

  it('the required (non-optional) result still anchors each resistance test', () => {
    expect(byPrimary.get('run')!.store_results.filter((r) => !r.optional).map((r) => r.slug)).toEqual(['run_5k']);
    expect(byPrimary.get('row')!.store_results.filter((r) => !r.optional).map((r) => r.slug)).toEqual(['row_2k']);
  });
});
