import { describe, expect, it } from 'vitest';

import {
  admissibleRaces,
  bestRun,
  buildGoalCheck,
  buildRaceEvidence,
  latestRun,
  runTrend,
  TREND_MIN_RACES,
  type RaceRow,
  type TargetRaceRow,
} from '@fahybrid/shared/domain/free-plan';

// The six completed races of athlete 72 in production ("Alex (free)", no coach),
// copied verbatim on 27-jul-2026. They are the reason this module exists: SIX
// doubles races, and two of them run on the SAME DAY with different partners —
// 2137 s over 8 km with one, 3162 s with the other. Any model that calls either
// of those "his 8 km" is lying, and this fixture is what keeps it honest.
const A72: RaceRow[] = [
  row(62, 'HYROX Barcelona', 'Barcelona', '2025-04-25', 'doubles', 'open', 'men', 4149, 2361, 377),
  row(61, 'HYROX Berlin', 'Berlin', '2025-05-16', 'doubles', 'open', 'men', 3722, 1959, 412),
  row(60, 'HYROX Bilbao', 'Bilbao', '2026-02-07', 'doubles', 'open', 'men', 3817, 2206, 271),
  row(59, 'HYROX Paris', 'Paris', '2026-04-23', 'doubles', 'pro', 'men', 4231, 2099, 366),
  row(57, 'HYROX Barcelona', 'Barcelona', '2026-05-14', 'doubles', 'open', 'mixed', 5218, 3162, 411),
  row(58, 'HYROX Barcelona', 'Barcelona', '2026-05-14', 'doubles', 'pro', 'men', 3953, 2137, 274),
];

/** His planned target: Leapmotor HYROX Barcelona, doubles pro men, goal 1:10:00. */
const A72_TARGET: TargetRaceRow = {
  ...row(63, 'Leapmotor HYROX Barcelona', 'Barcelona', '2026-11-11', 'doubles', 'pro', 'men', null, null, null),
  goal_time_seconds: 4200,
};

function row(
  race_id: number,
  name: string,
  location: string | null,
  race_date: string | null,
  format: string,
  division: string | null,
  gender_category: string | null,
  result_time_seconds: number | null,
  run_total_seconds: number | null,
  roxzone_seconds: number | null,
): RaceRow {
  return {
    race_id,
    name,
    location,
    race_date,
    event_type: 'hyrox',
    format,
    division,
    gender_category,
    result_time_seconds,
    run_total_seconds,
    roxzone_seconds,
    is_synthetic: false,
  };
}

describe('admissibleRaces', () => {
  it('drops seeded rows — a scaled split is never evidence', () => {
    const seeded = { ...A72[0]!, race_id: 999, is_synthetic: true };
    expect(admissibleRaces([...A72, seeded]).map((r) => r.race_id)).not.toContain(999);
  });

  it('drops non-HYROX events — a DEKA has neither 8 km nor the same anatomy', () => {
    const deka = { ...A72[0]!, race_id: 998, event_type: 'deka' };
    expect(admissibleRaces([deka])).toHaveLength(0);
  });

  it('drops rows with nothing measured on them', () => {
    const empty = row(997, 'HYROX Madrid', null, '2026-01-01', 'doubles', 'open', 'men', null, null, null);
    expect(admissibleRaces([empty])).toHaveLength(0);
  });
});

describe('bestRun — athlete 72', () => {
  it('picks Berlin, his fastest 8 km', () => {
    const run = bestRun(A72)!;
    expect(run.race.name).toBe('HYROX Berlin');
    expect(run.total_seconds).toBe(1959);
  });

  it('reports 4:04.9 /km — 1959 s over the race 8 km, not a station-derived number', () => {
    expect(bestRun(A72)!.pace_s_per_km).toBeCloseTo(244.875, 3);
  });

  it('flags it partner-bounded: in doubles the pair runs together', () => {
    expect(bestRun(A72)!.partner_bounded).toBe(true);
  });

  it('does NOT flag a solo race', () => {
    const solo = { ...A72[1]!, format: 'singles' };
    expect(bestRun([solo])!.partner_bounded).toBe(false);
  });
});

describe('latestRun — athlete 72', () => {
  it('takes the faster of two races on the same day (the other carries more partner drag)', () => {
    const run = latestRun(A72)!;
    expect(run.race.race_id).toBe(58);
    expect(run.total_seconds).toBe(2137);
  });
});

describe('runTrend — the claim we refuse to make', () => {
  it('emits nothing for athlete 72: six races, every one of them doubles', () => {
    expect(runTrend(A72)).toBeNull();
  });

  it('still emits nothing once there are 3+ team races — a partner is not a trend', () => {
    expect(A72.length).toBeGreaterThanOrEqual(TREND_MIN_RACES);
    expect(runTrend(A72)).toBeNull();
  });

  it('reads a real improvement across solo races', () => {
    const solo = A72.slice(0, 3).map((r, i) => ({
      ...r,
      format: 'singles',
      run_total_seconds: 2400 - i * 120,
      race_date: `2026-0${i + 1}-01`,
    }));
    const trend = runTrend(solo)!;
    expect(trend.direction).toBe('mejora');
    expect(trend.delta_s_per_km).toBeLessThan(0);
    expect(trend.races_counted).toBe(3);
  });

  it('calls a 2 % drift stable rather than dressing noise as progress', () => {
    const solo = A72.slice(0, 3).map((r, i) => ({
      ...r,
      format: 'singles',
      run_total_seconds: 2400 + i * 4,
      race_date: `2026-0${i + 1}-01`,
    }));
    expect(runTrend(solo)!.direction).toBe('estable');
  });

  it('needs 3 races before claiming anything', () => {
    const solo = A72.slice(0, 2).map((r) => ({ ...r, format: 'singles' }));
    expect(runTrend(solo)).toBeNull();
  });
});

describe('buildRaceEvidence — athlete 72', () => {
  const evidence = buildRaceEvidence(A72)!;

  it('counts all six', () => {
    expect(evidence.races_counted).toBe(6);
  });

  it('best finish is Berlin 3722 s, flagged as a TEAM result', () => {
    expect(evidence.best_finish!.total_seconds).toBe(3722);
    expect(evidence.best_finish!.race.location).toBe('Berlin');
    expect(evidence.best_finish!.team_result).toBe(true);
  });

  it('best roxzone is Bilbao, 271 s', () => {
    expect(evidence.best_roxzone!.seconds).toBe(271);
    expect(evidence.best_roxzone!.race.name).toBe('HYROX Bilbao');
  });

  it('returns null with nothing admissible', () => {
    expect(buildRaceEvidence([])).toBeNull();
  });
});

describe('buildGoalCheck — athlete 72', () => {
  it('compares only against the same format + division + gender category', () => {
    const check = buildGoalCheck(A72_TARGET, A72)!;
    // His doubles-PRO-men races are Paris (4231) and Barcelona (3953). The open
    // and the mixed ones must not be borrowed, however flattering they'd be.
    expect(check.comparable_best!.total_seconds).toBe(3953);
    expect(check.comparable_best!.race.race_id).toBe(58);
  });

  it('tells him his goal is 247 s SLOWER than what he has already done', () => {
    const check = buildGoalCheck(A72_TARGET, A72)!;
    expect(check.goal_seconds).toBe(4200);
    expect(check.delta_seconds).toBe(4200 - 3953);
    expect(check.not_comparable_reason).toBeNull();
  });

  it('never borrows his 3722 s Berlin time — that was OPEN, the goal is PRO', () => {
    const check = buildGoalCheck(A72_TARGET, A72)!;
    expect(check.comparable_best!.total_seconds).not.toBe(3722);
  });

  it('names WHY when he has races but none comparable', () => {
    const openOnly = A72.filter((r) => r.division === 'open');
    const check = buildGoalCheck(A72_TARGET, openOnly)!;
    expect(check.comparable_best).toBeNull();
    expect(check.not_comparable_reason).toBe('formato_distinto');
    expect(check.delta_seconds).toBeNull();
  });

  it('names the other reason when he has no races at all', () => {
    const check = buildGoalCheck(A72_TARGET, [])!;
    expect(check.not_comparable_reason).toBe('sin_carreras');
  });

  it('returns null without a goal time — nothing to check', () => {
    expect(buildGoalCheck({ ...A72_TARGET, goal_time_seconds: null }, A72)).toBeNull();
  });
});
