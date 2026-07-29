import { describe, expect, it } from 'vitest';
import { benchmarkForTestEvent } from '@fahybrid/shared/domain/athlete/record-test-result';
import {
  BENCH_HRR_60,
  BENCH_LTHR,
  benchmarkLowerIsBetter,
  benchmarkIsDirectional,
  benchmarkMetric,
  benchmarkLabel,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { storeResultsSchema } from '@fahybrid/shared/schema/test-battery';
import {
  DEFAULT_CALIBRATION_BATTERY,
  LTHR_30MIN_SLUG,
  calibrationTargetByKey,
  specForCalibrationTarget,
  calibrationCoherenceError,
} from '@fahybrid/shared/domain/coach/test-battery';

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

describe('benchmarkIsDirectional — an anchor is not a performance', () => {
  it('the threshold HR gets NO improvement verdict', () => {
    // bpm would answer "higher is better", which is false for a threshold: the
    // number is individual and drifts down with age while fitness improves.
    expect(benchmarkIsDirectional(BENCH_LTHR)).toBe(false);
  });

  it('every other benchmark keeps its verdict', () => {
    expect(benchmarkIsDirectional(BENCH_HRR_60)).toBe(true);
    expect(benchmarkIsDirectional('run_5k')).toBe(true);
    expect(benchmarkIsDirectional('back_squat_1rm')).toBe(true);
  });
});

describe('an absolute heart rate is not a heart-rate DROP', () => {
  it('an hr event records the pulse under its slug, in bpm', () => {
    const row = benchmarkForTestEvent({
      kind: 'hr',
      athlete_id: 1,
      exercise_slug: BENCH_LTHR,
      bpm: 168,
      source: 'athlete_test',
    });
    expect(row).toEqual({ exercise_slug: 'lthr_bpm', value: 168, unit: 'bpm' });
  });

  it('a pulse is a RATE, so it never formats as a clock', () => {
    // Before `rate` existed, bpm fell through to `time` and 156 ppm rendered "2:36".
    expect(benchmarkMetric('bpm')).toBe('rate');
    expect(benchmarkMetric('seconds')).toBe('time');
  });

  it('the threshold has an athlete-facing label (not a humanized slug)', () => {
    expect(benchmarkLabel(BENCH_LTHR)).toBe('Umbral de pulso');
  });
});

describe('store_results contract admits a calibrating HR result', () => {
  it('accepts measure hr / unit bpm deriving hr_zones, with NO modality', () => {
    const parsed = storeResultsSchema.safeParse([
      { slug: 'lthr_bpm', measure: 'hr', unit: 'bpm', derives: 'hr_zones', label: 'Umbral de pulso' },
    ]);
    expect(parsed.success).toBe(true);
  });

  it('still rejects a non-calibrating measure that claims to derive', () => {
    const parsed = storeResultsSchema.safeParse([
      { slug: 'x', measure: 'reps', unit: 'reps', derives: 'hr_zones', label: 'X' },
    ]);
    expect(parsed.success).toBe(false);
  });
});

describe('calibrationCoherenceError — the HR target matches despite having no modality', () => {
  it('the catalog spec for the threshold is coherent', () => {
    const spec = specForCalibrationTarget(calibrationTargetByKey('hr_zones')!);
    expect(calibrationCoherenceError(spec)).toBeNull();
  });

  it('an HR result that invents a modality is rejected', () => {
    const spec = specForCalibrationTarget(calibrationTargetByKey('hr_zones')!);
    expect(calibrationCoherenceError({ ...spec, modality: 'run' })).not.toBeNull();
  });

  it('an HR result stored as seconds is rejected (the unit-corruption guard)', () => {
    const spec = specForCalibrationTarget(calibrationTargetByKey('hr_zones')!);
    expect(
      calibrationCoherenceError({ ...spec, measure: 'time', unit: 'seconds' }),
    ).not.toBeNull();
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
  // Keyed by SLUG, not by primary_modality: two protocols are `run` (the 5K and
  // the 30-min threshold), so a modality map silently kept only the last one.
  const bySlug = new Map(DEFAULT_CALIBRATION_BATTERY.map((p) => [p.slug, p]));

  it('every resistance test carries an OPTIONAL hrr60 (bpm baseline)', () => {
    for (const slug of ['tt_5k', 'tt_2k_row', 'hyrox_half_sim', LTHR_30MIN_SLUG] as const) {
      const p = bySlug.get(slug)!;
      const hrr = p.store_results.find((r) => r.slug === 'hrr60');
      expect(hrr, `${slug} debe llevar hrr60`).toBeTruthy();
      expect(hrr!.optional).toBe(true);
      expect(hrr!.measure).toBe('hrr');
      expect(hrr!.unit).toBe('bpm');
      expect(hrr!.derives).toBe('none');
    }
  });

  it('the 1RM battery has NO hrr60 (HRR tras fuerza no es estándar)', () => {
    expect(bySlug.get('one_rm_battery')!.store_results.some((r) => r.slug === 'hrr60')).toBe(false);
  });

  it('the required (non-optional) result still anchors each resistance test', () => {
    const required = (slug: string) =>
      bySlug.get(slug)!.store_results.filter((r) => !r.optional).map((r) => r.slug);
    expect(required('tt_5k')).toEqual(['run_5k']);
    expect(required('tt_2k_row')).toEqual(['row_2k']);
    // The threshold test's one required number IS the anchor.
    expect(required(LTHR_30MIN_SLUG)).toEqual(['lthr_bpm']);
  });
});
