// The proposed week for an athlete with no coach (pure, no I/O).
//
// WHOSE STRUCTURE IS THIS? OURS, and deliberately generic. A HYROX is 8 km of
// running, two ergometers and five strength stations, all of it done tired. A
// week that trains it therefore contains: quality running, strength, ergo work,
// compromised running, and one long aerobic piece. That skeleton is the anatomy
// of the RACE — it is not anybody's methodology, and NOTHING here reads `blocks`,
// `templates`, `microcycles` or any other coach-owned content. The coach's
// programming is what the athlete is being invited to buy; it is never given away.
//
// WHOSE NUMBERS ARE THESE? HIS, or the session does not exist.
//
//   · running paces → Daniels & Gilbert, via the VDOT module already in the repo,
//                     seeded from his best-suited measured mark, else from the
//                     8 km of his best HYROX, else from his watch VO₂max.
//   · erg paces     → his own ski/row mark, stretched to the race's 1000 m with
//                     the published Riegel exponent (`projectErgMark`).
//   · strength load → a percentage of HIS stored 1RM.
//
// A session type he has no evidence for is ABSENT. It is never filled with a
// plausible-looking default, because two free accounts showing the same "example
// week" is the moment the whole screen stops being believable. That is also why
// the block has a floor (`MIN_SESSIONS`): below it there is no competence to
// demonstrate, so the client renders nothing at all.

import { projectErgMark, projectRunMark, type MarkRow, HYROX_RUN_TOTAL_METERS } from '../athlete/mark-projection';
import { trainingPacesForVdot, vdotFromEffort, vdotFromWatchVo2max, type DanielsTrainingPaces } from '../running/vdot';
import type { RunEvidence } from './types';
import type {
  ErgPrescription,
  PlannedSession,
  PlannedWeek,
  RunPrescription,
  SessionBasis,
  SessionKind,
  StrengthPrescription,
} from './types';

// ── The floor that decides whether the block exists at all ───────────────────

/** Below this many personalisable sessions there is no demonstration to make. */
export const MIN_SESSIONS = 2;
/** How many render unblurred. The rest are real sessions, shown blurred. */
export const VISIBLE_SESSIONS = 2;

// ── The generic week's shape ─────────────────────────────────────────────────
//
// Every constant below is a property of the RACE or a standard training practice,
// declared here once rather than scattered through the builders.

/** Canonical order of the archetypes within a week. Hard running early, long piece last. */
const KIND_ORDER: readonly SessionKind[] = ['run_quality', 'strength', 'erg', 'hybrid', 'long_run'];

/**
 * Which weekdays a week of N sessions occupies (Monday = 0), chosen to keep hard
 * days apart. Standard spacing, not a periodisation claim. Indexed by session
 * count; the count can only ever be 1..KIND_ORDER.length.
 */
const WEEKDAYS_BY_COUNT: readonly (readonly number[])[] = [
  [], // 0 sessions — never rendered
  [0], // LUN
  [0, 3], // LUN, JUE
  [0, 2, 5], // LUN, MIÉ, SÁB
  [0, 1, 3, 5], // LUN, MAR, JUE, SÁB
  [0, 1, 2, 3, 5], // LUN, MAR, MIÉ, JUE, SÁB
];

/** The day slots for a week of `count` sessions, clamped to the table. */
function weekdaysFor(count: number): readonly number[] {
  const index = Math.min(Math.max(count, 0), WEEKDAYS_BY_COUNT.length - 1);
  return WEEKDAYS_BY_COUNT[index] ?? [];
}

/** Quality running: the race's own 1 km repeat, at threshold. */
const RUN_QUALITY = { reps: 5, distance_m: 1000, rest_s: 120 } as const;

/** The long aerobic piece, in minutes of continuous easy running. */
const LONG_RUN_DURATION_S = 60 * 60;

/**
 * The compromised-running session, at EXACT race volume: 4 rounds of 25 wall
 * balls and 20 burpee broad jumps is the 100 and the 80 a HYROX actually asks
 * for, broken up by a kilometre each time. The volume is the race's, not ours.
 */
const HYBRID = {
  rounds: 4,
  distance_m: 1000,
  wall_balls_per_round: 25,
  burpees_per_round: 20,
} as const;

/** Erg intervals at the pace his mark projects for the race's 1000 m. */
const ERG_SESSION = { reps: 6, distance_m: 500, rest_s: 90 } as const;

/**
 * The strength dose.
 *
 * ORIGIN: 4×6 at 75 % of 1RM is a standard strength-endurance prescription, and
 * 75 % for six reps leaves roughly two repetitions in reserve on the usual
 * repetition-maximum tables (a 6RM sits near 85 % of 1RM). Declared assumption,
 * stated once — not a coach's programming.
 */
const STRENGTH = { sets: 4, reps: 6, percent_of_one_rm: 0.75, rir: 2, rest_s: 120, tempo: '2-0-1' } as const;

/**
 * Lifts that carry the race's strength stations, best transfer first: the squat
 * pattern drives the sleds and the lunges, the hinge drives the pull and the
 * farmers. The first one he has a stored max for is the one prescribed.
 */
const STRENGTH_PRIORITY: readonly string[] = [
  'back_squat_1rm',
  'deadlift_1rm',
  'clean_1rm',
  'bench_press_1rm',
  'ohp_1rm',
];

/** With a mark on both machines, the SkiErg leads: it opens the race. */
const ERG_PRIORITY: readonly ('ski' | 'row')[] = ['ski', 'row'];

// ── Inputs ───────────────────────────────────────────────────────────────────

/** One stored one-rep max. */
export interface StrengthMaxRow {
  exercise_slug: string;
  one_rm_kg: number;
}

/** Everything the generator is allowed to personalise from. */
export interface WeekInputs {
  /** `athlete_benchmarks` rows, already reduced by the loader. */
  marks: readonly MarkRow[];
  /** His best HYROX run — the fallback when he has measured no running mark. */
  best_run: RunEvidence | null;
  /** Latest watch VO₂max reading, or null. */
  vo2max: number | null;
  strength_maxes: readonly StrengthMaxRow[];
}

// ── Running capacity ─────────────────────────────────────────────────────────

/** His running level plus where it came from. */
interface RunCapacity {
  paces: DanielsTrainingPaces;
  basis: SessionBasis;
}

/**
 * A pace sustained over the race's 8 km, read back as a VDOT.
 *
 * `paceForRaceDistance` (used inside `projectRunMark`) and `vdotFromEffort` solve
 * the SAME two Daniels equations at the same distance, so this round-trips the
 * projection's answer back onto the fitness index without re-implementing which
 * mark wins — that selection rule stays in `mark-projection`, where it is tested.
 */
function vdotFrom8kPace(pace_s_per_km: number): number | null {
  return vdotFromEffort({
    distance_meters: HYROX_RUN_TOTAL_METERS,
    duration_seconds: (pace_s_per_km * HYROX_RUN_TOTAL_METERS) / 1000,
  });
}

/**
 * His running level, strongest evidence first.
 *
 *   1. a measured mark — a clean solo effort;
 *   2. the 8 km of his best HYROX — real, but in a team race it carries his
 *      partner (see `partner_bounded`), so it can only understate him;
 *   3. his watch's VO₂max — modelled, and the first thing he is invited to replace.
 *
 * The mark outranks the race deliberately: a race run is done between stations
 * and, in doubles, alongside someone else. Both make it a floor on his running,
 * and training paces set from a floor are too easy.
 */
export function runCapacity(inputs: WeekInputs): RunCapacity | null {
  const mark = projectRunMark(inputs.marks);
  const markPaces = trainingPacesForVdot(mark ? vdotFrom8kPace(mark.value_s) : null);
  if (mark && markPaces) {
    return { paces: markPaces, basis: { source: 'marca', race: null, mark_slug: mark.from_slug } };
  }

  const run = inputs.best_run;
  const racePaces = run
    ? trainingPacesForVdot(
        vdotFromEffort({
          distance_meters: HYROX_RUN_TOTAL_METERS,
          duration_seconds: run.total_seconds,
        }),
      )
    : null;
  if (run && racePaces) {
    return { paces: racePaces, basis: { source: 'carrera', race: run.race, mark_slug: null } };
  }

  const watchPaces = trainingPacesForVdot(vdotFromWatchVo2max(inputs.vo2max));
  if (watchPaces) {
    return { paces: watchPaces, basis: { source: 'vo2max', race: null, mark_slug: null } };
  }

  return null;
}

// ── Session builders ─────────────────────────────────────────────────────────

function runSession(
  kind: SessionKind,
  run: RunPrescription,
  basis: SessionBasis,
): PlannedSession {
  return { kind, weekday: 0, run, erg: null, strength: null, basis };
}

function buildRunQuality(capacity: RunCapacity): PlannedSession {
  return runSession(
    'run_quality',
    {
      shape: 'intervals',
      reps: RUN_QUALITY.reps,
      distance_m: RUN_QUALITY.distance_m,
      duration_s: null,
      target_pace_s_per_km: Math.round(capacity.paces.threshold_s_per_km),
      rest_s: RUN_QUALITY.rest_s,
      stations: [],
    },
    capacity.basis,
  );
}

function buildHybrid(capacity: RunCapacity): PlannedSession {
  return runSession(
    'hybrid',
    {
      shape: 'hybrid_rounds',
      reps: HYBRID.rounds,
      distance_m: HYBRID.distance_m,
      duration_s: null,
      // Marathon pace is Daniels' anchor for an effort of this length — the pace
      // he has to hold AFTER a station, not the one he can hit fresh.
      target_pace_s_per_km: Math.round(capacity.paces.marathon_s_per_km),
      rest_s: null,
      stations: [
        { station: 'wall_balls', reps: HYBRID.wall_balls_per_round },
        { station: 'burpee_broad_jump', reps: HYBRID.burpees_per_round },
      ],
    },
    capacity.basis,
  );
}

function buildLongRun(capacity: RunCapacity): PlannedSession {
  return runSession(
    'long_run',
    {
      shape: 'continuous',
      reps: 1,
      distance_m: null,
      duration_s: LONG_RUN_DURATION_S,
      target_pace_s_per_km: Math.round(capacity.paces.easy_s_per_km),
      rest_s: null,
      stations: [],
    },
    capacity.basis,
  );
}

/** The erg session, for the first machine he has a mark on. */
export function buildErg(marks: readonly MarkRow[]): PlannedSession | null {
  for (const erg of ERG_PRIORITY) {
    const projected = projectErgMark(marks, erg);
    if (!projected) continue;
    const prescription: ErgPrescription = {
      erg,
      reps: ERG_SESSION.reps,
      distance_m: ERG_SESSION.distance_m,
      target_pace_s_per_500: Math.round(projected.value_s),
      rest_s: ERG_SESSION.rest_s,
    };
    return {
      kind: 'erg',
      weekday: 0,
      run: null,
      erg: prescription,
      strength: null,
      basis: { source: 'marca', race: null, mark_slug: projected.from_slug },
    };
  }
  return null;
}

/** The strength session, for the best-transferring lift he has a max on. */
export function buildStrength(maxes: readonly StrengthMaxRow[]): PlannedSession | null {
  for (const slug of STRENGTH_PRIORITY) {
    const found = maxes.find((row) => row.exercise_slug === slug && row.one_rm_kg > 0);
    if (!found) continue;
    const prescription: StrengthPrescription = {
      exercise_slug: slug,
      one_rm_kg: found.one_rm_kg,
      percent_of_one_rm: STRENGTH.percent_of_one_rm,
      sets: STRENGTH.sets,
      reps: STRENGTH.reps,
      // Rounded to the nearest 2.5 kg — the smallest pair of plates in a gym.
      load_kg: Math.round((found.one_rm_kg * STRENGTH.percent_of_one_rm) / 2.5) * 2.5,
      rir: STRENGTH.rir,
      rest_s: STRENGTH.rest_s,
      tempo: STRENGTH.tempo,
    };
    return {
      kind: 'strength',
      weekday: 0,
      run: null,
      erg: null,
      strength: prescription,
      basis: { source: 'marca', race: null, mark_slug: slug },
    };
  }
  return null;
}

// ── The week ─────────────────────────────────────────────────────────────────

/**
 * Build the week, or return null.
 *
 * Null means "he cannot be shown a personalised week yet" — fewer than
 * `MIN_SESSIONS` rows survived, so there is nothing to prove. The client paints
 * nothing rather than padding it out.
 */
export function buildWeek(inputs: WeekInputs): PlannedWeek | null {
  const capacity = runCapacity(inputs);
  const byKind = new Map<SessionKind, PlannedSession>();

  if (capacity) {
    byKind.set('run_quality', buildRunQuality(capacity));
    byKind.set('hybrid', buildHybrid(capacity));
    byKind.set('long_run', buildLongRun(capacity));
  }
  const erg = buildErg(inputs.marks);
  if (erg) byKind.set('erg', erg);
  const strength = buildStrength(inputs.strength_maxes);
  if (strength) byKind.set('strength', strength);

  const sessions = KIND_ORDER.map((kind) => byKind.get(kind)).filter(
    (session): session is PlannedSession => session != null,
  );
  if (sessions.length < MIN_SESSIONS) return null;

  const days = weekdaysFor(sessions.length);
  const placed: PlannedSession[] = sessions.map((session, index) => ({
    ...session,
    weekday: days[index] ?? index,
  }));

  return { sessions: placed, visible_count: Math.min(VISIBLE_SESSIONS, placed.length) };
}
