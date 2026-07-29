import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALIBRATION_BATTERY,
  storeResultSpecBySlug,
  LTHR_30MIN_SLUG,
} from '@fahybrid/shared/domain/coach/test-battery';
import {
  storeResultsSchema,
  recordTestResultsBodySchema,
} from '@fahybrid/shared/schema/test-battery';
import { benchmarkForTestEvent } from '@fahybrid/shared/domain/athlete/record-test-result';
import {
  BENCH_RUN_5K,
  BENCH_ROW_2K,
  BENCH_HYROX_HALF_SIM,
  BENCH_BACK_SQUAT_1RM,
  BENCH_LTHR,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { STRENGTH_LIFT_SLUGS } from '@fahybrid/shared/schema/strength';

// #34 — the calibration battery CONTRACT (pure, no DB). Pins that the catalog is
// complete and coherent so the seed + badge + bridge all agree.

describe('DEFAULT_CALIBRATION_BATTERY catalog', () => {
  it('schedules the fixed 4 (Fork B) in week 1, on distinct days', () => {
    const scheduled = DEFAULT_CALIBRATION_BATTERY.filter((p) => p.week_offset != null);
    expect(scheduled).toHaveLength(4);
    expect(scheduled.every((p) => p.week_offset === 1)).toBe(true);
    const days = scheduled.map((p) => p.day_of_week);
    expect(new Set(days).size).toBe(4); // spread, never piled on one day
  });

  it('the threshold-pulse test ships UNSCHEDULED — never a 5th maximal effort in week 1', () => {
    const lthr = DEFAULT_CALIBRATION_BATTERY.find((p) => p.slug === LTHR_30MIN_SLUG)!;
    expect(lthr).toBeDefined();
    // Both null together: the restore writes a schedule row only when both are set.
    expect(lthr.week_offset).toBeNull();
    expect(lthr.day_of_week).toBeNull();
  });

  it('a protocol is scheduled on both axes or on neither', () => {
    for (const p of DEFAULT_CALIBRATION_BATTERY) {
      expect(p.week_offset == null).toBe(p.day_of_week == null);
    }
  });

  it('the threshold-pulse test is the ONE protocol that writes a measured HR anchor', () => {
    const producers = DEFAULT_CALIBRATION_BATTERY.filter((p) =>
      p.store_results.some((s) => s.slug === BENCH_LTHR),
    );
    expect(producers.map((p) => p.slug)).toEqual([LTHR_30MIN_SLUG]);

    const spec = storeResultSpecBySlug(BENCH_LTHR)!;
    // bpm, not seconds: the bridge routes on `measure`, and 'time' would file a
    // threshold of 156 ppm as 156 seconds.
    expect(spec.measure).toBe('hr');
    expect(spec.unit).toBe('bpm');
    expect(spec.derives).toBe('hr_zones');
    // HR zones are one physiological ladder, not one per modality.
    expect(spec.modality).toBeUndefined();
    // It is required: a threshold test that captures nothing measured nothing.
    expect(spec.optional ?? false).toBe(false);
  });

  it('every protocol store_results validates against the contract schema', () => {
    for (const p of DEFAULT_CALIBRATION_BATTERY) {
      expect(p.store_results.length).toBeGreaterThan(0); // ⇒ is_test = true
      expect(storeResultsSchema.safeParse(p.store_results).success).toBe(true);
    }
  });

  it('uses the LIVE slugs (not the dead stub vocabulary)', () => {
    const all = DEFAULT_CALIBRATION_BATTERY.flatMap((p) => p.store_results.map((s) => s.slug));
    expect(all).toContain(BENCH_RUN_5K);
    expect(all).toContain(BENCH_ROW_2K);
    expect(all).toContain(BENCH_HYROX_HALF_SIM);
    expect(all).toContain(BENCH_BACK_SQUAT_1RM);
    // the stub's non-canonical slugs must be gone
    expect(all).not.toContain('5k_time_trial');
    expect(all).not.toContain('1rm_battery');
  });

  it('the 1RM battery is one protocol → several load results; strength slugs are canonical lifts', () => {
    const battery = DEFAULT_CALIBRATION_BATTERY.find((p) => p.primary_modality === 'strength')!;
    expect(battery.store_results.length).toBeGreaterThanOrEqual(3);
    for (const s of battery.store_results) {
      expect(s.measure).toBe('load');
      expect(s.derives).toBe('strength_max');
      expect(STRENGTH_LIFT_SLUGS).toContain(s.slug as (typeof STRENGTH_LIFT_SLUGS)[number]);
    }
  });

  it('the half-sim is a stored baseline (derives nothing — half ≠ full race)', () => {
    const spec = storeResultSpecBySlug(BENCH_HYROX_HALF_SIM)!;
    expect(spec.derives).toBe('none');
    expect(spec.measure).toBe('time');
  });

  it('zone tests declare their modality so the bridge can derive', () => {
    expect(storeResultSpecBySlug(BENCH_RUN_5K)?.modality).toBe('run');
    expect(storeResultSpecBySlug(BENCH_RUN_5K)?.derives).toBe('run_zones');
    expect(storeResultSpecBySlug(BENCH_ROW_2K)?.modality).toBe('row');
  });
});

describe('benchmarkForTestEvent — the timetrial extension (#34)', () => {
  it('a real time-trial records its OWN slug in seconds (not a threshold)', () => {
    const row = benchmarkForTestEvent({
      kind: 'timetrial',
      athlete_id: 1,
      exercise_slug: BENCH_RUN_5K,
      seconds: 1290,
      source: 'athlete_test',
    });
    expect(row).toEqual({ exercise_slug: BENCH_RUN_5K, value: 1290, unit: 'seconds' });
  });

  it('strength still maps to kg; the union stays exhaustive', () => {
    const row = benchmarkForTestEvent({
      kind: 'strength',
      athlete_id: 1,
      exercise_slug: BENCH_BACK_SQUAT_1RM,
      one_rm_kg: 140,
      source: 'coach_test',
    });
    expect(row).toEqual({ exercise_slug: BENCH_BACK_SQUAT_1RM, value: 140, unit: 'kg' });
  });
});

describe('recordTestResultsBodySchema', () => {
  it('accepts a non-empty list of positive entries', () => {
    expect(
      recordTestResultsBodySchema.safeParse({ results: [{ slug: 'run_5k', value: 1290 }] }).success,
    ).toBe(true);
  });
  it('rejects an empty list and non-positive values', () => {
    expect(recordTestResultsBodySchema.safeParse({ results: [] }).success).toBe(false);
    expect(
      recordTestResultsBodySchema.safeParse({ results: [{ slug: 'run_5k', value: 0 }] }).success,
    ).toBe(false);
  });
});
