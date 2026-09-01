// Pure unit tests for buildEffortCurve (shared/domain/running/best-efforts.ts).
//
// The discipline under test is ABSENCE and IDENTITY, not arithmetic. A rung
// nobody reached must not appear — never a zero, never something interpolated
// between its neighbours. A candidate can only fill a rung whose `aggregation`
// matches its own `scope`. And the projection onto the rung distance has to be
// the exact same `riegelTime` the mark projections use, imported and compared
// rather than restated — so a run off the exact rung distance can never become
// two different estimates in two modules.

import { describe, expect, test } from 'vitest';
import {
  EFFORT_CURVE_BANDS,
  RUN_PR_BANDS,
  buildEffortCurve,
  type EffortCandidate,
} from '@fahybrid/shared/domain/running/best-efforts';
import { riegelTime } from '@fahybrid/shared/domain/athlete/mark-projection';

describe('buildEffortCurve — a rung with no eligible candidate is ABSENT', () => {
  test('nothing lands in the 3000 m window: the rung is missing entirely — never 0, never interpolated', () => {
    const candidates: EffortCandidate[] = [
      { distance_m: 1000, duration_s: 240, scope: 'segment' }, // exact 1000 m rung
      { distance_m: 5000, duration_s: 1200, scope: 'execution' }, // exact 5000 m rung
      // nothing in between: the 3000 m rung has no candidate at all
    ];
    const res = buildEffortCurve(candidates);
    expect(res.map((p) => p.metros)).toEqual([1000, 5000]);
    expect(res.find((p) => p.metros === 3000)).toBeUndefined();
    expect(res).toHaveLength(2); // no third point hiding a 0 in the gap
  });
});

describe("buildEffortCurve — scope must match the rung's aggregation", () => {
  test('an execution-scope candidate at 900 m does NOT fill the 1000 m rung (segment-scope)', () => {
    const res = buildEffortCurve([{ distance_m: 900, duration_s: 200, scope: 'execution' }]);
    expect(res.find((p) => p.metros === 1000)).toBeUndefined();
    expect(res).toEqual([]);
  });

  test('a segment-scope candidate at 9500 m does NOT fill the 10000 m rung (execution-scope)', () => {
    const res = buildEffortCurve([{ distance_m: 9500, duration_s: 2000, scope: 'segment' }]);
    expect(res.find((p) => p.metros === 10000)).toBeUndefined();
    expect(res).toEqual([]);
  });
});

describe('buildEffortCurve — out-of-band distances are ignored', () => {
  test('700 m does not fill the 800 m rung, whose window is 720-880', () => {
    const res = buildEffortCurve([{ distance_m: 700, duration_s: 150, scope: 'segment' }]);
    expect(res).toEqual([]);
  });
});

describe('buildEffortCurve — Riegel normalisation', () => {
  test('a candidate off the exact rung distance is projected with the SAME riegelTime the mark projections use', () => {
    // 4800 m falls inside the 5000 m window (4500-5500) but is not exactly it.
    const candidate: EffortCandidate = { distance_m: 4800, duration_s: 1000, scope: 'execution' };
    const res = buildEffortCurve([candidate]);
    const expected = Math.round(riegelTime(candidate.duration_s, candidate.distance_m, 5000));
    expect(res).toEqual([{ metros: 5000, segundos: expected }]);
  });
});

describe('buildEffortCurve — the fastest candidate wins', () => {
  test('three candidates at the exact same distance: the lowest duration wins, not the first in the list nor an average', () => {
    const res = buildEffortCurve([
      { distance_m: 1000, duration_s: 260, scope: 'segment' },
      { distance_m: 1000, duration_s: 245, scope: 'segment' }, // the best
      { distance_m: 1000, duration_s: 250, scope: 'segment' },
    ]);
    // All three sit exactly on 1000 m, so Riegel never moves them: the winner
    // is the raw minimum duration.
    expect(res).toEqual([{ metros: 1000, segundos: 245 }]);
  });
});

describe('EFFORT_CURVE_BANDS — identity with RUN_PR_BANDS', () => {
  test('EFFORT_CURVE_BANDS[1000/3000/5000] ARE (identity) RUN_PR_BANDS.run_1k/3k/5k — the curve and PR detection can never disagree on what counts as a kilometre', () => {
    expect(EFFORT_CURVE_BANDS[1000]).toBe(RUN_PR_BANDS.run_1k);
    expect(EFFORT_CURVE_BANDS[3000]).toBe(RUN_PR_BANDS.run_3k);
    expect(EFFORT_CURVE_BANDS[5000]).toBe(RUN_PR_BANDS.run_5k);
  });
});

describe('buildEffortCurve — garbage in, nothing out (never Infinity)', () => {
  test('zero, negative, or NaN distance is ignored', () => {
    const res = buildEffortCurve([
      { distance_m: 0, duration_s: 200, scope: 'segment' },
      { distance_m: -1000, duration_s: 200, scope: 'segment' },
      { distance_m: Number.NaN, duration_s: 200, scope: 'segment' },
    ]);
    expect(res).toEqual([]);
  });

  test('zero, negative, or NaN duration is ignored', () => {
    const res = buildEffortCurve([
      { distance_m: 1000, duration_s: 0, scope: 'segment' },
      { distance_m: 1000, duration_s: -200, scope: 'segment' },
      { distance_m: 1000, duration_s: Number.NaN, scope: 'segment' },
    ]);
    expect(res).toEqual([]);
  });
});
