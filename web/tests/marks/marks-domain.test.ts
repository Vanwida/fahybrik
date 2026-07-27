// The Marcas catalog — the arithmetic that decides what counts as a mark and a PR.
//
// WHY PINNED: two silent failure modes. (1) Cooper is the only mark where MORE is
// better — if the direction flips, every Cooper "PR" celebrates a regression.
// (2) Run marks compare per context — if a treadmill 5K beats the street PR, the
// belt (which literally moves the floor for you) starts breaking records.

import { describe, expect, it } from 'vitest';
import {
  MARKS,
  isPersonalBest,
  markBySlug,
  registrableMarks,
  selfTestableMarks,
  validateMarkValue,
} from '../../../shared/domain/athlete/marks';

describe('the catalog', () => {
  it('has exactly 6 self-testable marks and 3 registrable races', () => {
    expect(selfTestableMarks().map((m) => m.slug).sort()).toEqual(
      ['cooper_12min', 'row_1k', 'row_500m', 'run_1k', 'run_5k', 'ski_1k'].sort(),
    );
    expect(registrableMarks().map((m) => m.slug).sort()).toEqual(
      ['run_10k', 'run_half', 'run_marathon'].sort(),
    );
  });

  it('Cooper is the only higher-is-better mark, and it is stored in meters', () => {
    const higher = MARKS.filter((m) => !m.lower_is_better);
    expect(higher.map((m) => m.slug)).toEqual(['cooper_12min']);
    expect(higher[0]!.unit).toBe('meters');
    expect(higher[0]!.fixed_duration_s).toBe(720);
  });

  it('the station marks carry their canonical race slot (SkiErg 2 · RowErg 10)', () => {
    expect(markBySlug('ski_1k')?.race_station_index).toBe(2);
    expect(markBySlug('row_1k')?.race_station_index).toBe(10);
    // And nothing else pretends to be a station.
    expect(MARKS.filter((m) => m.race_station_index != null)).toHaveLength(2);
  });

  it('every erg mark declares its machine and exact monitor distance', () => {
    for (const m of MARKS.filter((x) => x.measured_by === 'erg')) {
      expect(m.erg === 'row' || m.erg === 'ski').toBe(true);
      expect(m.target_distance_m).toBeGreaterThan(0);
    }
  });
});

describe('validateMarkValue', () => {
  it('rejects the impossible, keeps the merely slow', () => {
    // 2:00 for 1 km is faster than the world record → out.
    expect(validateMarkValue('run_1k', 119).ok).toBe(false);
    // 19 minutes walking a 1 km is a real (bad) day → in.
    expect(validateMarkValue('run_1k', 1140).ok).toBe(true);
    // A 30-minute marathon → out.
    expect(validateMarkValue('run_marathon', 1800).ok).toBe(false);
  });

  it('rejects unknown slugs and non-finite values', () => {
    expect(validateMarkValue('bench_marathon', 100)).toEqual({ ok: false, error: 'unknown_mark' });
    expect(validateMarkValue('run_1k', Number.NaN).ok).toBe(false);
    expect(validateMarkValue('run_1k', Infinity).ok).toBe(false);
  });
});

describe('isPersonalBest', () => {
  const ski = markBySlug('ski_1k')!;
  const cooper = markBySlug('cooper_12min')!;
  const run5k = markBySlug('run_5k')!;

  it('a first attempt is always a PR', () => {
    expect(isPersonalBest(ski, 240, [])).toBe(true);
  });

  it('time marks improve downward', () => {
    expect(isPersonalBest(ski, 229, [{ value: 230 }, { value: 245 }])).toBe(true);
    expect(isPersonalBest(ski, 230, [{ value: 230 }])).toBe(false); // a tie is not a PR
  });

  it('Cooper improves upward', () => {
    expect(isPersonalBest(cooper, 2900, [{ value: 2870 }])).toBe(true);
    expect(isPersonalBest(cooper, 2800, [{ value: 2870 }])).toBe(false);
  });

  it('a treadmill run never beats the street PR — contexts keep separate records', () => {
    const history = [
      { value: 1300, run_context: 'outdoor' }, // street PR 21:40
      { value: 1360, run_context: 'treadmill' },
    ];
    // 21:20 on the belt: PR *of the belt*, even though it beats the street time.
    expect(isPersonalBest(run5k, 1280, history, 'treadmill')).toBe(true);
    // 21:30 outdoors: beats the street 21:40 → outdoor PR.
    expect(isPersonalBest(run5k, 1290, history, 'outdoor')).toBe(true);
    // 21:50 outdoors: slower than the street PR, no matter what the belt says.
    expect(isPersonalBest(run5k, 1310, history, 'outdoor')).toBe(false);
  });

  it('ergo marks ignore context entirely', () => {
    expect(isPersonalBest(ski, 229, [{ value: 230, run_context: 'outdoor' }])).toBe(true);
  });
});
