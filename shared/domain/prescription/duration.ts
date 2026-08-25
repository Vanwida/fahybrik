// Prescription DURATION — how much clock a prescription actually writes down.
//
// WHY THIS EXISTS
// ---------------
// The athlete's week used to carry an `est_duration_minutes` built from two
// invented constants (`SECONDS_PER_REP = 4`, `DEFAULT_SET_REST_SECONDS = 60`)
// applied to `params_json`. Measured against production it was not merely
// imprecise, it was reading the wrong thing: the four sessions of one real week
// came out at 32 / 26 / 26 / 26 min because the only segments the formula could
// read were the shared warm-up and cool-down. Every one of those templates ships
// the SAME mobility framing (760 s of warm-up + 780 s of cool-down ≈ 26 min), so
// three different sessions produced one identical number while the actual work —
// 8 km of running, four sleds, 100 wall balls, 4×squat at 65-80 % — contributed
// exactly zero. The HYROX simulation was measured at 73 min and announced as 32.
//
// THE RULE, STATED ONCE
// ---------------------
// A prescription's duration is either WRITTEN or it is the RESULT.
//
//   · WRITTEN — the coach fixed the clock: a `total_s` window, a `rounds ×
//     work_s` cycle, sets measured in `duration`, or a distance against a
//     prescribed PACE (distance ÷ pace is the plan's own arithmetic, not a guess
//     about the athlete).
//   · THE RESULT — a `for_time` block, reps without a tempo, a distance without a
//     pace, calories without a rate. How long it takes IS the score. Predicting
//     it means inventing the athlete's performance.
//
// So this module never estimates. It SUMS WHAT IS WRITTEN and reports honestly
// when the writing does not close the clock. `docs/CONTRATO-UI.md` §7: lo que no
// se sabe no se pinta, y ningún valor por defecto puede parecer un dato del
// atleta. See docs/DECISIONS.md, «"No se sabe" es un valor de primera clase».
//
// A FLOOR, NOT AN ESTIMATE
// ------------------------
// Even a fully-written session omits the seconds nobody writes down: walking to
// the rig, racking a bar, the drills in a warm-up. So the number this module
// returns is a LOWER BOUND — "the plan writes down at least X minutes" — and it
// is always to be read and rendered that way. It is never wrong in the direction
// that matters: everything unwritten only adds. (The same floor semantics Alex
// already accepted for team races: `shared/domain/free-plan/race-evidence.ts`.)
//
// WHY MISSING REST IS NOT ZERO
// ----------------------------
// `rounds: 5, work_s: 300` with no `rest_s` is 25 min of work and an unknown
// amount of recovery. Counting the rest as 0 is the same class of error as
// counting it as 60 — a default wearing the costume of a measurement. Where a
// protocol DEFINES the cycle (an EMOM's minute, a Tabata's 10 s) the rest is part
// of the format's own arithmetic and does count; where it is a free parameter the
// coach simply did not write, the clock stays open.

import { WORKOUT_FORMATS } from './format';
import { lateralitySides } from './laterality';
import {
  setMeasure,
  setTarget,
  prescriptionTarget,
  type PaceUnit,
  type Prescription,
  type PrescriptionSet,
  type Target,
} from './types';
import { hasAnyDose, type PrescriptionRole } from './completeness';
import { flattenSegments, type Segment as RunSegment } from './run-structure';

// ── Why a duration cannot be stated ──────────────────────────────────────────
// Ordered by how much each tells the athlete about the session in front of them.
export type DurationUnknownReason =
  /** The format's SCORE is the clock (`for_time`, `chipper`, `ladder`, `rounds`,
   *  `hyrox_sim`) and the work is not measured in time. The duration IS the
   *  result — it is not merely unknown, it is not a property of the plan. */
  | 'scored_by_time'
  /** `death_by` — the session ends when the athlete fails. */
  | 'until_failure'
  /** The work is prescribed but nothing converts it to time: reps without a
   *  tempo, a distance without a pace, calories without a rate, or sets whose
   *  rest the coach left open. */
  | 'work_not_timed'
  /** The prescription states no work at all. A content gap, not a domain
   *  property — the coach can fix this one. */
  | 'undosed';

/** How confident the written clock is. `exact` = every item was written;
 *  `floor` = the principal work was written but some accessory item was not. */
export type DurationBasis = 'exact' | 'floor';

export type PrescriptionDuration =
  | { known: true; seconds: number }
  | { known: false; reason: DurationUnknownReason };

const known = (seconds: number): PrescriptionDuration => ({ known: true, seconds });
const unknown = (reason: DurationUnknownReason): PrescriptionDuration => ({
  known: false,
  reason,
});

/** Metres covered by one unit of a pace target, so distance ÷ pace is exact. */
const METRES_PER_PACE_UNIT: Record<PaceUnit, number> = {
  per_km: 1000,
  per_500m: 500,
  per_mile: 1609.344,
};

/** The seconds-per-unit of a pace target, when it states one. A RANGE uses its
 *  SLOWEST bound: the floor must never overstate how fast the athlete will go. */
function paceSeconds(t: Target | undefined): { unit: PaceUnit; seconds: number } | null {
  if (!t || t.kind !== 'pace') return null;
  const seconds = t.max_s ?? t.value_s ?? t.min_s;
  if (seconds == null || seconds <= 0) return null;
  return { unit: t.unit, seconds };
}

/** One set's work in seconds, when the prescription writes it. A set is written
 *  when it is measured in TIME, or in DISTANCE against a prescribed PACE. Reps
 *  and calories carry no rate, so they are the athlete's result, not the plan's. */
function setSeconds(s: PrescriptionSet, p: Prescription): number | null {
  const m = setMeasure(s);
  if (!m) return null;
  const sides = lateralitySides(p.laterality);
  if (m.kind === 'duration') return m.seconds * sides;
  if (m.kind === 'distance') {
    const pace = paceSeconds(setTarget(s) ?? prescriptionTarget(p));
    if (!pace) return null;
    return (m.meters / METRES_PER_PACE_UNIT[pace.unit]) * pace.seconds * sides;
  }
  return null; // reps | calories — no rate to convert them with
}

/**
 * A #61 structured run's written clock. The structure is the TRUTH for these
 * rows; the flattened legacy fields alongside it are a lossy best-effort (real
 * example, template 451: the flatten reads `3 × 600 s = 30 min` for a session
 * that is 10 min of warm-up, a 5 km time trial and 10 min of cool-down — the
 * time trial has no written clock at all). Reading the flatten would restate the
 * exact fabrication this module exists to remove.
 */
function structureSeconds(structure: NonNullable<Prescription['structure']>): number | null {
  let total = 0;
  for (const seg of flattenSegments(structure) as RunSegment[]) {
    if (seg.measure.type === 'duration') {
      total += seg.measure.s;
      continue;
    }
    // distance — written only against a pace. A `pace_zone` resolves per athlete
    // and is not part of the prescription, so it does not close the clock here.
    const t = seg.target;
    if (t && t.type === 'pace') {
      const perKm = t.max_s ?? t.value_s ?? t.min_s;
      if (perKm != null && perKm > 0) {
        total += (seg.measure.m / METRES_PER_PACE_UNIT.per_km) * perKm;
        continue;
      }
    }
    return null;
  }
  return total;
}

/**
 * The clock ONE prescription writes down, or why it writes none.
 *
 * Evaluation order matters: a `for_time` block carrying `total_s` is carrying a
 * CAP, not a window (see `Prescription.total_s`), so the format's score is read
 * before any window is trusted.
 */
export function prescriptionDuration(p: Prescription): PrescriptionDuration {
  if (!hasAnyDose(p)) return unknown('undosed');

  const meta = WORKOUT_FORMATS[p.scheme];

  // The athlete's own performance IS the clock. No window, no cap, no sum can
  // change that — these return before anything else is considered.
  if (meta?.score === 'rounds_survived') return unknown('until_failure');
  if (meta?.score === 'time') {
    // …unless the WORK itself is written in time ("5 rondas de 5 min en Z4"),
    // in which case the round structure closes it — or, when only the recovery
    // was left open, says so. Reporting "dura lo que tardes" for a session whose
    // 25 minutes of work are written would be its own small lie.
    const rounds = roundsSeconds(p);
    return rounds ?? unknown('scored_by_time');
  }

  // A structured run states its own truth; never read the lossy flatten.
  if (p.structure) {
    const s = structureSeconds(p.structure);
    return s == null ? unknown('work_not_timed') : known(s);
  }

  // A declared window IS the duration (`amrap`, `steady`).
  if (p.total_s != null && p.total_s > 0) return known(p.total_s);

  // A declared cycle × rounds (`emom`, `tabata`, `intervals`).
  const rounds = roundsSeconds(p);
  if (rounds) return rounds;

  // Otherwise the sets have to close it themselves.
  return setsSeconds(p);
}

/**
 * `rounds × cycle`, when the prescription declares both. Null when it does not —
 * never a default.
 *
 * Two rest conventions, both the protocol's own arithmetic rather than a guess:
 *   · `emom` / `tabata` — the CYCLE repeats, so every round carries its rest (an
 *     EMOM's minute is work + changeover; Tabata's eighth rest is real).
 *   · everything else — rest is recovery BETWEEN efforts, so `rounds − 1` gaps.
 *
 * A protocol that takes `rest_s` and was left without one keeps an OPEN clock:
 * "5 × 5 min en Z4" is 25 min of work plus an unwritten recovery, and calling
 * that recovery 0 is the same fabrication as calling it 60.
 */
function roundsSeconds(p: Prescription): PrescriptionDuration | null {
  const rounds = p.rounds;
  if (rounds == null || rounds <= 0) return null;

  // The per-round work: an explicit window, else whatever the sets write.
  let work = p.work_s ?? null;
  if (work == null) {
    const fromSets = setsWorkSeconds(p);
    if (fromSets == null) return null;
    work = fromSets;
  }
  if (work <= 0) return null;

  const cyclic = p.scheme === 'emom' || p.scheme === 'tabata';
  const gaps = cyclic ? rounds : Math.max(0, rounds - 1);
  // Widened to string[]: some formats declare an empty `params` tuple, which
  // narrows `includes` to `never` and makes the check untypable otherwise.
  const params: readonly string[] = WORKOUT_FORMATS[p.scheme]?.params ?? [];
  const takesRest = params.includes('rest_s');

  if (gaps === 0) return known(work * rounds);

  const rest = p.rest_between_rounds_s ?? p.rest_s ?? setRest(p);
  if (rest == null) {
    // A cyclic protocol without a stated changeover IS just its work window (a
    // plain EMOM's cycle is the minute itself). A between-efforts recovery that
    // the format accepts and the coach omitted leaves the clock open — and the
    // honest reason is the missing REST, not the format: the work is written.
    if (cyclic) return known(work * rounds);
    return takesRest ? unknown('work_not_timed') : known(work * rounds);
  }
  return known(work * rounds + rest * gaps);
}

/** The rest written on the sets, when they agree on one. */
function setRest(p: Prescription): number | null {
  const sets = p.sets ?? [];
  const rests = sets.map((s) => s.rest_s).filter((r): r is number => r != null);
  return rests.length > 0 ? Math.max(...rests) : null;
}

/** The work seconds of ONE round, summed from the sets. Null if any set is open. */
function setsWorkSeconds(p: Prescription): number | null {
  const sets = p.sets ?? [];
  if (sets.length === 0) return null;
  let total = 0;
  for (const s of sets) {
    const secs = setSeconds(s, p);
    if (secs == null) return null;
    total += secs;
  }
  return total;
}

/**
 * A `sets` block's clock, summed from its sets plus the rest BETWEEN them.
 * Multi-set work whose rest nobody wrote keeps an open clock — the same rule as
 * `roundsSeconds`, and the reason `DEFAULT_SET_REST_SECONDS` is gone.
 */
function setsSeconds(p: Prescription): PrescriptionDuration {
  const sets = p.sets ?? [];
  if (sets.length === 0) return unknown('undosed');

  let work = 0;
  for (const s of sets) {
    const secs = setSeconds(s, p);
    if (secs == null) return unknown('work_not_timed');
    work += secs;
  }

  const gaps = sets.length - 1;
  if (gaps === 0) return known(work);

  const rest = setRest(p) ?? p.rest_s ?? null;
  if (rest == null) return unknown('work_not_timed');
  return known(work + rest * gaps);
}

// ── Session level ───────────────────────────────────────────────────────────

/** One item of a session: its prescription and where it sits in the session. */
export interface SessionDurationItem {
  prescription: Prescription | null;
  role: PrescriptionRole;
}

export type SessionDuration =
  | {
      known: true;
      /** The clock the plan writes down. A FLOOR — read it as "al menos X". */
      minutes: number;
      basis: DurationBasis;
    }
  | {
      known: false;
      reason: DurationUnknownReason;
      /** Minutes that WERE written, for surfaces that report coverage. Never to
       *  be shown as "the session's duration" — that is the original bug. */
      timed_minutes: number;
      /** How many items carry no written clock. */
      open_items: number;
    };

/**
 * The session's written clock.
 *
 * The PRINCIPAL work decides. When every principal item writes its clock the
 * session gets a number — a floor, since accessory items may not have written
 * theirs. When ANY principal item is open the session gets NO number, because
 * the part that would be summed is the framing: the HYROX simulation's warm-up
 * and cool-down really do add up to 26 minutes, and announcing 26 for a 73-minute
 * race is worse than saying nothing.
 *
 * Reason priority reflects what most determines the session's length:
 * `scored_by_time` and `until_failure` are permanent properties of the session,
 * `undosed` is a fixable content gap, `work_not_timed` is the residue.
 */
export function sessionDuration(items: SessionDurationItem[]): SessionDuration {
  const REASON_PRIORITY: DurationUnknownReason[] = [
    'scored_by_time',
    'until_failure',
    'undosed',
    'work_not_timed',
  ];

  let timedSeconds = 0;
  let openItems = 0;
  let principalOpen = false;
  let accessoryOpen = false;
  const reasons = new Set<DurationUnknownReason>();

  for (const item of items) {
    const d = item.prescription
      ? prescriptionDuration(item.prescription)
      : unknown('undosed');
    if (d.known) {
      timedSeconds += d.seconds;
      continue;
    }
    openItems += 1;
    reasons.add(d.reason);
    if (item.role === 'principal') principalOpen = true;
    else accessoryOpen = true;
  }

  const timed_minutes = Math.round(timedSeconds / 60);

  if (items.length === 0) {
    return { known: false, reason: 'undosed', timed_minutes: 0, open_items: 0 };
  }

  if (principalOpen) {
    const reason = REASON_PRIORITY.find((r) => reasons.has(r)) ?? 'work_not_timed';
    return { known: false, reason, timed_minutes, open_items: openItems };
  }

  // Every principal item wrote its clock. A session that adds up to nothing is
  // not a zero-minute session — it is a session nobody dosed.
  if (timedSeconds <= 0) {
    return { known: false, reason: 'undosed', timed_minutes: 0, open_items: openItems };
  }

  return {
    known: true,
    minutes: Math.max(1, timed_minutes),
    basis: accessoryOpen ? 'floor' : 'exact',
  };
}

// ── Athlete-facing copy ─────────────────────────────────────────────────────
// One phrase per reason, so every surface says the same thing (CONTRATO-UI §2:
// un formateador por concepto). Spoken to an ATHLETE, not to a coach: no
// "prescripción", no "dosis sin medida", no format names.

export const DURATION_UNKNOWN_ES: Record<DurationUnknownReason, string> = {
  scored_by_time: '',
  until_failure: '',
  work_not_timed: '',
  undosed: '',
};

/** The athlete-facing phrase for a session with no written duration. */
export function durationUnknownEs(reason: DurationUnknownReason): string {
  return DURATION_UNKNOWN_ES[reason];
}
