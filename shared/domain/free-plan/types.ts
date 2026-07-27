// @fahybrid/shared/domain/free-plan — the wire shape of the FREE Plan tab.
//
// One athlete, no coach. Everything here is a statement ABOUT HIM, computed from
// HIS OWN rows — never a template, never a placeholder. The rule the whole module
// obeys: a number that cannot be derived from his evidence is `null`, and a null
// is not painted. There is no fallback copy, no lorem, no "example week".
//
// COPY LIVES IN THE CLIENT. This module emits numbers, enums and provenance; iOS
// composes the Spanish. That keeps the domain unit-testable on values alone and
// stops two surfaces from drifting into two different sentences for one number.

import type { EvidenceSource } from '../evidence';

// ── Identity of a race, for attribution ──────────────────────────────────────

/** How the race was contested. A team format changes what the numbers PROVE. */
export type RaceFormat = 'singles' | 'doubles' | 'relay';

/** Enough to name a race on screen and to decide comparability. */
export interface RaceRef {
  race_id: number;
  name: string;
  location: string | null;
  /** ISO `YYYY-MM-DD`, or null when the source had no machine-readable date. */
  race_date: string | null;
  format: RaceFormat;
  division: string | null;
  gender_category: string | null;
}

// ── What his races prove about HIM ───────────────────────────────────────────

/**
 * His finish time.
 *
 * `team_result` is the honesty flag: in doubles and relay the official time is
 * the TEAM's. It is genuinely his result — he crossed that line — but it is not
 * a measure of him alone, so the client must name the format next to it.
 */
export interface FinishEvidence {
  race: RaceRef;
  total_seconds: number;
  team_result: boolean;
}

/**
 * His 8 km of running inside a HYROX.
 *
 * WHY THIS IS THE ONE SEGMENT WORTH TRUSTING IN A TEAM RACE: both partners run
 * every kilometre. The stations are shared out, the running is not.
 *
 * WHY IT IS STILL ONLY A FLOOR (`partner_bounded`): they run TOGETHER, so the
 * pair's run time is set by the slower of the two. He ran AT LEAST this fast; he
 * may be considerably faster. Verified on real data — the same athlete, the same
 * day, two doubles races: 2137 s with one partner and 3162 s with another over
 * the identical 8 km. Attributing either to him alone would be a lie; treating
 * the best of them as a floor is the truth.
 */
export interface RunEvidence {
  race: RaceRef;
  total_seconds: number;
  pace_s_per_km: number;
  partner_bounded: boolean;
}

/**
 * The transitions. Real, his, and nobody else reports it back to him — in a team
 * race both athletes travel every metre of the roxzone together, so unlike a
 * station split this is not shared out.
 */
export interface RoxzoneEvidence {
  race: RaceRef;
  seconds: number;
}

/** Which way his running has gone. Only ever emitted for solo races — see `runTrend`. */
export interface RunTrend {
  direction: 'mejora' | 'empeora' | 'estable';
  /** Change in pace across the span. Negative = faster now. */
  delta_s_per_km: number;
  races_counted: number;
}

/** The portrait his imported history paints. Every field independently nullable. */
export interface RaceEvidence {
  races_counted: number;
  best_finish: FinishEvidence | null;
  best_run: RunEvidence | null;
  latest_run: RunEvidence | null;
  best_roxzone: RoxzoneEvidence | null;
  /** Null unless he has ≥3 SOLO races — a team run trend is partner noise. */
  run_trend: RunTrend | null;
}

// ── His goal against his own reality ─────────────────────────────────────────

/** Why we refused to compare. Named, so the client can say it out loud. */
export type NotComparableReason = 'sin_carreras' | 'formato_distinto';

/**
 * Goal vs the best race that is actually comparable to it.
 *
 * Comparability is strict — same format AND division AND gender category —
 * because the weights and the field change between them. Comparing a doubles
 * open time against a doubles pro goal would flatter him with a number that
 * means nothing.
 */
export interface GoalCheck {
  target: RaceRef;
  goal_seconds: number;
  comparable_best: FinishEvidence | null;
  /** Set exactly when `comparable_best` is null. */
  not_comparable_reason: NotComparableReason | null;
  /** `goal − comparable_best`. Positive = the goal is slower than what he has done. */
  delta_seconds: number | null;
}

// ── The proposed week ────────────────────────────────────────────────────────

/**
 * The five session archetypes of a HYROX week. GENERIC AND OURS: this is the
 * anatomy of the race (8 km of running, two ergs, five strength stations, all of
 * it done fatigued), not anybody's methodology. No coach block, template or
 * microcycle is read to build it — the value is the personalisation, not the
 * skeleton.
 */
export type SessionKind = 'run_quality' | 'strength' | 'erg' | 'hybrid' | 'long_run';

/** How the running is organised in a session. */
export type RunShape = 'intervals' | 'continuous' | 'hybrid_rounds';

/** A station he does between runs, at race volume. */
export interface StationWork {
  station: 'wall_balls' | 'burpee_broad_jump';
  reps: number;
}

export interface RunPrescription {
  shape: RunShape;
  /** Rounds / intervals. 1 for a continuous run. */
  reps: number;
  /** Metres per rep; null for a time-based continuous run. */
  distance_m: number | null;
  /** Seconds, for a time-based continuous run; null otherwise. */
  duration_s: number | null;
  target_pace_s_per_km: number;
  /** Recovery between reps; null when there is none. */
  rest_s: number | null;
  /** Only for `hybrid_rounds`: the work between runs. Empty otherwise. */
  stations: StationWork[];
}

export interface ErgPrescription {
  erg: 'ski' | 'row';
  reps: number;
  distance_m: number;
  /**
   * Seconds per 500 m.
   *
   * NAMED `…_500`, NOT `…_500m`: the iOS decoder converts snake_case by
   * capitalising each component, and a component starting with a digit cannot be
   * capitalised — `target_pace_s_per_500m` would arrive as `targetPaceSPer500m`
   * while `percent_1rm` would arrive as `percent1rm`, silently failing to decode
   * against the obvious Swift spelling. Keeping digits at the end of a component
   * removes the trap entirely.
   */
  target_pace_s_per_500: number;
  rest_s: number;
}

export interface StrengthPrescription {
  exercise_slug: string;
  one_rm_kg: number;
  /** Fraction of the 1RM, 0–1. See the naming note on `target_pace_s_per_500`. */
  percent_of_one_rm: number;
  sets: number;
  reps: number;
  load_kg: number;
  rir: number;
  rest_s: number;
  /** Eccentric-pause-concentric, seconds. */
  tempo: string;
}

/** Where a session's numbers came from, in the shared evidence vocabulary. */
export interface SessionBasis {
  source: EvidenceSource;
  /** The race or mark behind it, for the "calculado con…" line. */
  race: RaceRef | null;
  mark_slug: string | null;
}

/**
 * One session. Exactly one of `run` / `erg` / `strength` is non-null — the kind
 * says which, and the client renders accordingly.
 */
export interface PlannedSession {
  kind: SessionKind;
  /** Monday = 0 … Sunday = 6. The client owns the day's name. */
  weekday: number;
  run: RunPrescription | null;
  erg: ErgPrescription | null;
  strength: StrengthPrescription | null;
  basis: SessionBasis;
}

/**
 * The week, or nothing.
 *
 * `sessions` only ever contains rows we could personalise with HIS numbers. A
 * session type he has no evidence for is ABSENT, not filled in — which is why
 * `visible_count` is a floor the whole block depends on: below it there is no
 * demonstration of competence to make, so the client renders nothing at all.
 */
export interface PlannedWeek {
  sessions: PlannedSession[];
  /** How many render unblurred. The rest are real, and blurred. */
  visible_count: number;
}

// ── The endpoint payload ─────────────────────────────────────────────────────

export interface FreePlanPayload {
  race_evidence: RaceEvidence | null;
  goal_check: GoalCheck | null;
  week: PlannedWeek | null;
}
