import { describe, expect, it } from 'vitest';

import {
  buildWeek,
  MIN_SESSIONS,
  runCapacity,
  VISIBLE_SESSIONS,
  type StrengthMaxRow,
  type WeekInputs,
} from '@fahybrid/shared/domain/free-plan';
import type { MarkRow } from '@fahybrid/shared/domain/athlete/mark-projection';
import type { RunEvidence } from '@fahybrid/shared/domain/free-plan';

/**
 * Athlete 72's real situation on 27-jul-2026: 6 imported doubles races, ZERO
 * measured marks, ZERO strength maxes, ZERO vo2max readings. His best 8 km is
 * Berlin's 1959 s. This is the case the whole free tier has to survive — a
 * newcomer whose only evidence is an imported history.
 */
const A72_BEST_RUN: RunEvidence = {
  race: {
    race_id: 61,
    name: 'HYROX Berlin',
    location: 'Berlin',
    race_date: '2025-05-16',
    format: 'doubles',
    division: 'open',
    gender_category: 'men',
  },
  total_seconds: 1959,
  pace_s_per_km: 244.875,
  partner_bounded: true,
};

const A72: WeekInputs = { marks: [], best_run: A72_BEST_RUN, vo2max: null, strength_maxes: [] };

const EMPTY: WeekInputs = { marks: [], best_run: null, vo2max: null, strength_maxes: [] };

function mark(slug: string, value: number): MarkRow {
  return { slug, value, age_days: 10, source: 'athlete_test', run_context: null };
}

function max(exercise_slug: string, one_rm_kg: number): StrengthMaxRow {
  return { exercise_slug, one_rm_kg };
}

describe('no evidence → no block', () => {
  it('returns null with nothing at all', () => {
    expect(buildWeek(EMPTY)).toBeNull();
  });

  it('returns null when only strength exists — one session is below the floor', () => {
    const week = buildWeek({ ...EMPTY, strength_maxes: [max('back_squat_1rm', 140)] });
    expect(week).toBeNull();
  });

  it('the floor is 2 and it is what gates the block', () => {
    expect(MIN_SESSIONS).toBe(2);
    const week = buildWeek({ ...EMPTY, strength_maxes: [max('back_squat_1rm', 140)], marks: [mark('ski_1k', 240)] });
    expect(week!.sessions).toHaveLength(MIN_SESSIONS);
  });
});

describe('athlete 72 — the numbers come from his imported races', () => {
  const week = buildWeek(A72)!;

  it('renders a block: three run-derived sessions clear the floor', () => {
    expect(week.sessions.map((s) => s.kind)).toEqual(['run_quality', 'hybrid', 'long_run']);
  });

  it('every session is sourced to his RACE, not a mark he never took', () => {
    for (const session of week.sessions) {
      expect(session.basis.source).toBe('carrera');
      expect(session.basis.race!.name).toBe('HYROX Berlin');
      expect(session.basis.mark_slug).toBeNull();
    }
  });

  it('omits the erg session — he has no ski or row mark', () => {
    expect(week.sessions.find((s) => s.kind === 'erg')).toBeUndefined();
  });

  it('omits the strength session — he has no stored 1RM', () => {
    expect(week.sessions.find((s) => s.kind === 'strength')).toBeUndefined();
  });

  it('spaces three sessions across LUN / MIÉ / SÁB', () => {
    expect(week.sessions.map((s) => s.weekday)).toEqual([0, 2, 5]);
  });

  it('shows 2 and blurs the rest', () => {
    expect(week.visible_count).toBe(VISIBLE_SESSIONS);
    expect(week.sessions.length).toBeGreaterThan(week.visible_count);
  });

  it('quality run: 5 x 1 km at threshold pace, derived from his 1959 s', () => {
    const run = week.sessions.find((s) => s.kind === 'run_quality')!.run!;
    expect(run.shape).toBe('intervals');
    expect(run.reps).toBe(5);
    expect(run.distance_m).toBe(1000);
    expect(run.rest_s).toBe(120);
    // VDOT ~50 from 8 km in 1959 s → threshold ≈ 4:15/km.
    expect(run.target_pace_s_per_km).toBeGreaterThan(240);
    expect(run.target_pace_s_per_km).toBeLessThan(270);
  });

  it('hybrid session carries the RACE volume: 100 wall balls and 80 burpees', () => {
    const run = week.sessions.find((s) => s.kind === 'hybrid')!.run!;
    const wall = run.stations.find((s) => s.station === 'wall_balls')!;
    const burpee = run.stations.find((s) => s.station === 'burpee_broad_jump')!;
    expect(run.reps * wall.reps).toBe(100);
    expect(run.reps * burpee.reps).toBe(80);
  });

  it('long run is easy pace, and easy is slower than threshold', () => {
    const easy = week.sessions.find((s) => s.kind === 'long_run')!.run!;
    const threshold = week.sessions.find((s) => s.kind === 'run_quality')!.run!;
    expect(easy.shape).toBe('continuous');
    expect(easy.duration_s).toBe(3600);
    expect(easy.target_pace_s_per_km).toBeGreaterThan(threshold.target_pace_s_per_km);
  });

  it('paces are ordered as Daniels orders them: interval < threshold < marathon < easy', () => {
    const quality = week.sessions.find((s) => s.kind === 'run_quality')!.run!.target_pace_s_per_km;
    const hybrid = week.sessions.find((s) => s.kind === 'hybrid')!.run!.target_pace_s_per_km;
    const easy = week.sessions.find((s) => s.kind === 'long_run')!.run!.target_pace_s_per_km;
    expect(quality).toBeLessThan(hybrid);
    expect(hybrid).toBeLessThan(easy);
  });
});

describe('evidence precedence', () => {
  it('a measured mark outranks a partner-bounded race run', () => {
    const capacity = runCapacity({ ...A72, marks: [mark('run_5k', 1200)] })!;
    expect(capacity.basis.source).toBe('marca');
    expect(capacity.basis.mark_slug).toBe('run_5k');
  });

  it('a race run outranks the watch', () => {
    expect(runCapacity({ ...A72, vo2max: 52 })!.basis.source).toBe('carrera');
  });

  it('the watch is the last resort, and it is used', () => {
    const capacity = runCapacity({ ...EMPTY, vo2max: 52 })!;
    expect(capacity.basis.source).toBe('vo2max');
  });

  it('a faster mark yields faster paces — the athlete drives the number', () => {
    const slow = runCapacity({ ...EMPTY, marks: [mark('run_5k', 1500)] })!;
    const fast = runCapacity({ ...EMPTY, marks: [mark('run_5k', 1100)] })!;
    expect(fast.paces.threshold_s_per_km).toBeLessThan(slow.paces.threshold_s_per_km);
  });

  it('refuses marks the athlete never measured (onboarding declarations)', () => {
    const declared: MarkRow = { ...mark('run_5k', 1200), source: 'onboarding' };
    expect(runCapacity({ ...EMPTY, marks: [declared] })).toBeNull();
  });
});

describe('erg session', () => {
  it('uses his own ski mark, stretched to the race 1000 m', () => {
    const week = buildWeek({ ...A72, marks: [mark('ski_1k', 240)] })!;
    const erg = week.sessions.find((s) => s.kind === 'erg')!;
    expect(erg.erg!.erg).toBe('ski');
    expect(erg.erg!.reps).toBe(6);
    expect(erg.erg!.distance_m).toBe(500);
    // A 1000 m in 240 s is 120 s per 500 m.
    expect(erg.erg!.target_pace_s_per_500).toBe(120);
    expect(erg.basis.mark_slug).toBe('ski_1k');
  });

  it('stretches a 500 m mark rather than doubling it', () => {
    const week = buildWeek({ ...A72, marks: [mark('row_500m', 100)] })!;
    const erg = week.sessions.find((s) => s.kind === 'erg')!.erg!;
    expect(erg.erg).toBe('row');
    // Riegel, not x2: the projected 1000 m split is SLOWER than the 500 m pace.
    expect(erg.target_pace_s_per_500).toBeGreaterThan(100);
  });

  it('the SkiErg leads when he has both', () => {
    const week = buildWeek({ ...A72, marks: [mark('ski_1k', 240), mark('row_1k', 220)] })!;
    expect(week.sessions.find((s) => s.kind === 'erg')!.erg!.erg).toBe('ski');
  });
});

describe('strength session', () => {
  it('loads a percentage of HIS stored 1RM', () => {
    const week = buildWeek({ ...A72, strength_maxes: [max('back_squat_1rm', 140)] })!;
    const strength = week.sessions.find((s) => s.kind === 'strength')!.strength!;
    expect(strength.exercise_slug).toBe('back_squat_1rm');
    expect(strength.one_rm_kg).toBe(140);
    expect(strength.load_kg).toBe(105); // 75 % of 140
    expect(strength.sets).toBe(4);
    expect(strength.reps).toBe(6);
    expect(strength.rir).toBe(2);
    expect(strength.rest_s).toBe(120);
    expect(strength.tempo).toBe('2-0-1');
  });

  it('rounds the load to the nearest 2.5 kg — real plates', () => {
    const week = buildWeek({ ...A72, strength_maxes: [max('back_squat_1rm', 137)] })!;
    const load = week.sessions.find((s) => s.kind === 'strength')!.strength!.load_kg;
    expect(load % 2.5).toBe(0);
  });

  it('prefers the squat over lifts that transfer less', () => {
    const week = buildWeek({
      ...A72,
      strength_maxes: [max('ohp_1rm', 60), max('back_squat_1rm', 140)],
    })!;
    expect(week.sessions.find((s) => s.kind === 'strength')!.strength!.exercise_slug).toBe('back_squat_1rm');
  });

  it('ignores a max of zero', () => {
    const week = buildWeek({ ...A72, strength_maxes: [max('back_squat_1rm', 0)] })!;
    expect(week.sessions.find((s) => s.kind === 'strength')).toBeUndefined();
  });
});

describe('a fully-evidenced athlete gets the whole week', () => {
  const full = buildWeek({
    marks: [mark('run_5k', 1200), mark('ski_1k', 240)],
    best_run: A72_BEST_RUN,
    vo2max: 55,
    strength_maxes: [max('back_squat_1rm', 140)],
  })!;

  it('renders all five archetypes in canonical order', () => {
    expect(full.sessions.map((s) => s.kind)).toEqual([
      'run_quality',
      'strength',
      'erg',
      'hybrid',
      'long_run',
    ]);
  });

  it('spreads them LUN / MAR / MIÉ / JUE / SÁB', () => {
    expect(full.sessions.map((s) => s.weekday)).toEqual([0, 1, 2, 3, 5]);
  });

  it('still only reveals two', () => {
    expect(full.visible_count).toBe(2);
  });

  it('every session carries exactly one prescription', () => {
    for (const session of full.sessions) {
      const filled = [session.run, session.erg, session.strength].filter((p) => p != null);
      expect(filled).toHaveLength(1);
    }
  });
});
