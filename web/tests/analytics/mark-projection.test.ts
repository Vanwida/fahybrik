// Pure unit tests for MARCAS → nivel entrenado (no DB).
//
// This is the cable that was missing: «Probarme» wrote to athlete_benchmarks and
// no prediction path ever read a row of it. These tests pin the conversion — that
// a 500 m erg time is NOT doubled, that a 1 km time trial does not get to speak
// for eight kilometres at its own pace, that the provenance rules hold, and that
// the watch's VO₂max covers an athlete who has never timed anything.

import { describe, expect, it } from 'vitest';
import {
  projectErgMark,
  projectRunFromVo2max,
  projectRunMark,
  riegelTime,
  HYROX_RUN_TOTAL_METERS,
  RIEGEL_ENDURANCE_EXPONENT,
  type MarkRow,
} from '@fahybrid/shared/domain/athlete/mark-projection';
import { paceForRaceDistance, vdotFromEffort } from '@fahybrid/shared/domain/running/vdot';

function mark(partial: Partial<MarkRow> & Pick<MarkRow, 'slug' | 'value'>): MarkRow {
  return { age_days: 10, source: 'athlete_test', run_context: null, ...partial };
}

// ── El exponente de resistencia (nunca ×2) ────────────────────────────────────
describe('riegelTime · 500 → 1000 m', () => {
  /**
   * THE BUG THIS PINS. The model used to turn a 500 m erg pace into a 1000 m race
   * split by multiplying by two — i.e. it promised every athlete they would hold
   * their sprint pace for twice the distance. Nobody does.
   */
  it('a 1000 m costs MORE than two 500s, by the published exponent', () => {
    const t500 = 105; // 1:45
    const t1000 = riegelTime(t500, 500, 1000);
    expect(t1000).toBeGreaterThan(t500 * 2);
    expect(t1000).toBeCloseTo(t500 * Math.pow(2, RIEGEL_ENDURANCE_EXPONENT), 6);
  });

  /**
   * The sanity check that keeps the exponent honest: Concept2's own rule of thumb
   * is that pace slows by roughly five seconds per 500 m each time the distance
   * doubles. Riegel's published 1.06 has to reproduce that, or it is the wrong
   * constant for an ergometer.
   */
  it('reproduces the "+~5 s per 500 m per doubling" the erg world quotes', () => {
    for (const t500 of [90, 105, 120]) {
      const pace1000 = riegelTime(t500, 500, 1000) / 2;
      const slowdown = pace1000 - t500;
      expect(slowdown).toBeGreaterThan(3);
      expect(slowdown).toBeLessThan(6);
    }
  });
});

// ── Ergos ─────────────────────────────────────────────────────────────────────
describe('projectErgMark', () => {
  it('a 1000 m mark converts straight (it IS the race distance)', () => {
    const p = projectErgMark([mark({ slug: 'ski_1k', value: 240 })], 'ski')!;
    expect(p.value_s).toBeCloseTo(120, 6); // 240 s over 1000 m = 120 s/500 m
    expect(p).toMatchObject({ source: 'marca', weakened: false, from_slug: 'ski_1k' });
  });

  it('a 500 m mark is stretched, never doubled', () => {
    const p = projectErgMark([mark({ slug: 'row_500m', value: 105 })], 'row')!;
    // ×2 would give a 105 s/500 m pace. The endurance exponent makes it slower.
    expect(p.value_s).toBeGreaterThan(105);
    expect(p.value_s).toBeCloseTo(riegelTime(105, 500, 1000) / 2, 6);
  });

  it('prefers the 1000 m over the 500 m — least extrapolation wins', () => {
    const rows = [
      mark({ slug: 'row_500m', value: 100, age_days: 1 }), // fresher, but stretched
      mark({ slug: 'row_1k', value: 220, age_days: 200 }),
    ];
    expect(projectErgMark(rows, 'row')!.from_slug).toBe('row_1k');
  });

  it('keeps the two machines apart', () => {
    const rows = [mark({ slug: 'ski_1k', value: 240 })];
    expect(projectErgMark(rows, 'ski')).not.toBeNull();
    expect(projectErgMark(rows, 'row')).toBeNull();
  });
});

// ── Correr ────────────────────────────────────────────────────────────────────
describe('projectRunMark', () => {
  it('re-expresses a 5K at the race distance, slower than the 5K pace itself', () => {
    const p = projectRunMark([mark({ slug: 'run_5k', value: 1200 })])!; // 20:00 → 240 s/km
    expect(p.source).toBe('marca');
    expect(p.from_slug).toBe('run_5k');
    // Eight kilometres are not run at 5 K pace.
    expect(p.value_s).toBeGreaterThan(240);
    // …and the number is the published model, not a fudge.
    const expected = paceForRaceDistance(vdotFromEffort({ distance_meters: 5000, duration_seconds: 1200 })!, HYROX_RUN_TOTAL_METERS)!;
    expect(p.value_s).toBeCloseTo(expected, 6);
  });

  /**
   * THE BUG THIS PINS (spec §05: "unos diez minutos de fantasía"). Taking a 1 km
   * time trial as the pace for the whole 8 km run predicted a race nobody could
   * run. Through Daniels the same mark lands where it belongs — and the 5 K, being
   * far less of a stretch, is preferred whenever it exists.
   */
  it('a 1 km time trial does not get to speak for 8 km at its own pace', () => {
    const p = projectRunMark([mark({ slug: 'run_1k', value: 210 })])!; // 3:30/km flat out
    expect(p.value_s).toBeGreaterThan(210 * 1.1);
  });

  it('prefers the mark closest to 8 km: the 10K over the 5K over the 1 km', () => {
    const rows = [
      mark({ slug: 'run_1k', value: 210 }),
      mark({ slug: 'run_5k', value: 1200 }),
      mark({ slug: 'run_10k', value: 2600, source: 'registered' }),
    ];
    expect(projectRunMark(rows)!.from_slug).toBe('run_10k');
    expect(projectRunMark(rows.slice(0, 2))!.from_slug).toBe('run_5k');
  });

  it('a treadmill mark is used, but it costs a notch of confidence', () => {
    const belt = projectRunMark([mark({ slug: 'run_5k', value: 1200, run_context: 'treadmill' })])!;
    const street = projectRunMark([mark({ slug: 'run_5k', value: 1200, run_context: 'outdoor' })])!;
    expect(belt.value_s).toBeCloseTo(street.value_s, 6);
    expect(belt.weakened).toBe(true);
    expect(street.weakened).toBe(false);
  });

  it('at equal distance, the street mark wins the tie-break', () => {
    const rows = [
      mark({ slug: 'run_5k', value: 1150, run_context: 'treadmill', age_days: 1 }),
      mark({ slug: 'run_5k', value: 1200, run_context: 'outdoor', age_days: 30 }),
    ];
    expect(projectRunMark(rows)!.weakened).toBe(false);
  });

  /**
   * Migration 0139 states it outright: `onboarding` is self-declared at signup and
   * "nunca cuenta como test real"; `unknown` is historic rows and demo seeds. Same
   * rule as `is_synthetic` for races — a number nobody measured is not evidence.
   */
  it('refuses self-declared and untagged rows', () => {
    expect(projectRunMark([mark({ slug: 'run_5k', value: 1200, source: 'onboarding' })])).toBeNull();
    expect(projectRunMark([mark({ slug: 'run_5k', value: 1200, source: 'unknown' })])).toBeNull();
    expect(projectRunMark([mark({ slug: 'run_5k', value: 1200, source: 'coach_test' })])).not.toBeNull();
  });

  it('a registered race counts, one notch below an app-measured mark', () => {
    const p = projectRunMark([mark({ slug: 'run_10k', value: 2600, source: 'registered' })])!;
    expect(p.weakened).toBe(true);
  });

  it('ignores an implausible value rather than emitting a fantasy pace', () => {
    // A 5 K "in 5 minutes" is off the VDOT scale → no projection at all.
    expect(projectRunMark([mark({ slug: 'run_5k', value: 300 })])).toBeNull();
  });

  it('nothing usable → null, never a fabricated level', () => {
    expect(projectRunMark([])).toBeNull();
    expect(projectRunMark([mark({ slug: 'row_1k', value: 220 })])).toBeNull();
  });
});

// ── VO₂max del reloj ──────────────────────────────────────────────────────────
describe('projectRunFromVo2max', () => {
  it('turns a wrist VO₂max into a race-distance pace', () => {
    // 41.7 ml/kg/min — a real production reading from the Apple Watch feed.
    const p = projectRunFromVo2max(41.7, 3)!;
    expect(p.source).toBe('vo2max');
    expect(p.from_slug).toBeNull();
    // Somewhere sane for a ~42 VO₂max over 8 km: between 4:30 and 6:30 per km.
    expect(p.value_s).toBeGreaterThan(270);
    expect(p.value_s).toBeLessThan(390);
  });

  it('a better VO₂max is a faster pace', () => {
    const slow = projectRunFromVo2max(38, 0)!;
    const fast = projectRunFromVo2max(55, 0)!;
    expect(fast.value_s).toBeLessThan(slow.value_s);
  });

  it('rejects an absent or off-scale reading', () => {
    expect(projectRunFromVo2max(null, null)).toBeNull();
    expect(projectRunFromVo2max(12, 0)).toBeNull();
    expect(projectRunFromVo2max(140, 0)).toBeNull();
  });
});
