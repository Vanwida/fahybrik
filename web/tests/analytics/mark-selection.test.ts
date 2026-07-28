// ONE evidence rule for every aerobic number the app shows.
//
// Before 28-jul-2026 the athlete's VO₂max screen ranked its own benchmark rows:
// it took the LONGEST Cooper while the race projection took the freshest, and it
// accepted ANY 5 km while the projection refused rows nobody measured. Two
// numbers of the same name, off two different tests.
//
// The rows in the first block are the REAL rows athlete 67 has in production
// (three run_5k, every one of them `source='unknown'`).

import { describe, expect, it } from 'vitest';
import {
  selectCooperVo2max,
  selectRunMark,
  type MarkRow,
} from '@fahybrid/shared/domain/athlete/mark-projection';
import { vdotFromEffort, vo2maxFromCooperMeters } from '@fahybrid/shared/domain/running/vdot';

const row = (o: Partial<MarkRow> & { slug: string; value: number }): MarkRow => ({
  age_days: 30,
  source: 'athlete_test',
  run_context: null,
  ...o,
});

describe('the provenance filter reaches the VO₂max screen too', () => {
  // Athlete 67's actual rows, copied from the production database.
  const athlete67: MarkRow[] = [
    row({ slug: 'run_5k', value: 1260, age_days: 99, source: 'unknown' }),
    row({ slug: 'run_5k', value: 1225, age_days: 57, source: 'unknown' }),
    row({ slug: 'run_5k', value: 1198, age_days: 29, source: 'unknown' }),
  ];

  it('refuses an `unknown`-provenance 5 km — the number that used to reach Inicio', () => {
    // What the old code printed: a VDOT straight off the newest row.
    expect(vdotFromEffort({ distance_meters: 5000, duration_seconds: 1198 })).toBeCloseTo(49.9, 1);
    // What the selector says now: nothing measured it, so there is no number.
    expect(selectRunMark(athlete67)).toBeNull();
  });

  it('refuses an onboarding-declared mark', () => {
    expect(selectRunMark([row({ slug: 'run_5k', value: 1200, source: 'onboarding' })])).toBeNull();
  });

  it('accepts a measured one', () => {
    const picked = selectRunMark([row({ slug: 'run_5k', value: 1200 })]);
    expect(picked?.spec.slug).toBe('run_5k');
    expect(picked?.vdot).toBeCloseTo(49.8, 1);
  });
});

describe('Cooper and Daniels are two magnitudes, not two opinions', () => {
  it('reads the same 2800 m Cooper as 51.3 VO₂max and 43.9 VDOT', () => {
    expect(vo2maxFromCooperMeters(2800)).toBe(51.3);
    expect(vdotFromEffort({ distance_meters: 2800, duration_seconds: 720 })).toBeCloseTo(43.9, 1);
  });

  it('exposes both off the SAME winning row, so the screen can say so', () => {
    const rows = [row({ slug: 'cooper_12min', value: 2800, age_days: 10 })];
    expect(selectCooperVo2max(rows)?.vo2max).toBe(51.3);
    expect(selectRunMark(rows)?.vdot).toBeCloseTo(43.9, 1);
    expect(selectCooperVo2max(rows)?.row).toBe(selectRunMark(rows)?.row);
  });
});

describe('which Cooper wins', () => {
  it('takes the freshest, not the longest — the number is about today', () => {
    const picked = selectCooperVo2max([
      row({ slug: 'cooper_12min', value: 3000, age_days: 120 }), // the PR, four months old
      row({ slug: 'cooper_12min', value: 2800, age_days: 10 }), // what he can do now
    ]);
    expect(picked?.row.value).toBe(2800);
    // The old rule (`order by value desc`) would have shown this instead:
    expect(vo2maxFromCooperMeters(3000)).toBe(55.8);
  });

  it('never lets an unmeasured Cooper win, however fresh', () => {
    const picked = selectCooperVo2max([
      row({ slug: 'cooper_12min', value: 2800, age_days: 40 }),
      row({ slug: 'cooper_12min', value: 3400, age_days: 1, source: 'onboarding' }),
    ]);
    expect(picked?.row.value).toBe(2800);
  });

  it('has nothing to say when there is no Cooper at all', () => {
    expect(selectCooperVo2max([row({ slug: 'run_5k', value: 1200 })])).toBeNull();
  });
});

describe('the plan and the screen read the same mark', () => {
  it('prefers the least-extrapolated mark over the freshest one', () => {
    // A 10 K needs less stretching to 8 km than a 1 km sprint, so it wins even
    // though the sprint is newer. This is the projection's rule, and now the
    // VO₂max screen's too — they cannot pick different tests any more.
    const picked = selectRunMark([
      row({ slug: 'run_1k', value: 210, age_days: 1 }),
      row({ slug: 'run_10k', value: 2600, age_days: 60 }),
    ]);
    expect(picked?.spec.slug).toBe('run_10k');
  });
});
