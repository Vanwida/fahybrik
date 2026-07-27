// @fahybrid/shared/domain/goal-gap — TYPES.
//
// The GOAL side of the HYROX loop: given an athlete's target time, decompose it
// into a per-segment BUDGET (what each part must cost to hit the goal), PREDICT
// what each part will actually cost from the athlete's training + race history,
// and read the GAP (predicted total − goal) segment by segment.
//
// The decomposition is the fixed HYROX singles skeleton — exactly 10 segments:
//   · 1 RUN     — the 8×1 km runs summed (kind 'run')
//   · 8 STATION — SkiErg · Sled push · Sled pull · Burpee broad jump · Row ·
//                 Farmer carry · Sandbag lunge · Wall ball (kind 'station')
//   · 1 ROXZONE — the transitions (kind 'roxzone')
// Their sum IS the race total, so the budget always closes to the goal and the
// prediction is comparable segment by segment.
//
// Everything here is computed by the pure functions in this folder (no DB, no
// I/O) so the whole tree is exhaustively unit-testable. The web loader fetches
// the rows (the cohort, the athlete's own race, the training × race cross) and
// hands them in; iOS/web format the numeric output.

import { EVIDENCE_HALF_LIFE_DAYS, type EvidenceSource } from '../evidence';

/** Cohort races needed before a division/gender aggregate is trustworthy. */
export const MIN_COHORT_RACES = 5;

/**
 * The age at which a race's splits stop outweighing the current estimate — i.e.
 * the point where the two weigh the same.
 *
 * It used to be a CLIFF: under 180 days the ten segments came out of the race raw
 * and the projected total was, to the second, that race. Five months of training
 * could not move it. It is now the HALF-LIFE of a continuous decay
 * (domain/evidence), so the same belief holds — 180 days is where the race stops
 * dominating — while every week of training moves the number.
 */
export const RECENT_RACE_DAYS = EVIDENCE_HALF_LIFE_DAYS;

/** A cohort race matches a goal when its result is within ±this of the goal. */
export const COHORT_GOAL_TOLERANCE = 0.1;

/** Bumped whenever the budget/prediction math changes, so a stored snapshot is
 *  attributable to the model that produced it (race_predictions.model_version). */
export const GOAL_GAP_MODEL_VERSION = 'goal-gap@1';

/** The wire kind of a segment. A station keeps its finer training kind
 *  (ski/row/functional) internally, but the run + all stations + roxzone reduce
 *  to these three for display. */
export type SegmentKind = 'run' | 'station' | 'roxzone';

/** Where the per-segment BUDGET fractions came from. */
export type BudgetSource = 'cohorte' | 'tu_carrera';

/** How much a segment's PREDICTION is trusted, best first:
 *   · observado — the athlete's own race split still outweighs the estimate
 *                 (i.e. it is younger than one half-life).
 *   · estimado  — a modelled number: a measured mark / threshold / training level
 *                 scaled to a full split × the personal race-tax factor, or an
 *                 aged race split that the estimate has caught up with.
 *   · sin_datos — nothing to stand on; no fabricated number.
 *
 * The coarse tier is the WIRE contract the installed app renders. `EvidenceSource`
 * on the same segment says precisely which evidence produced it. */
export type PredictionTier = 'observado' | 'estimado' | 'sin_datos';

/** The finer training kind of a cross target, from race-transfer. Drives the
 *  conversion of a trained level (comparison basis) into a full segment split:
 *   · run        — trained is s/km; a full run is 8 km → ×8.
 *   · ski | row  — trained is s/500 m; a full erg split is 1000 m → ×2.
 *   · functional — trained is the station practice duration → ×1. */
export type TrainedKind = 'run' | 'ski' | 'row' | 'functional';

/** One of the 10 segments, identity only (slug/label/kind), in render order. */
export interface SegmentDef {
  slug: string;
  label_es: string;
  kind: SegmentKind;
  /** Canonical station_index (2..16) for a station; null for run / roxzone. */
  station_index: number | null;
}

/** A cohort race reduced to the 10 segment seconds + its total. Every field is
 *  present and > 0 (the loader only passes COMPLETE races), so its 10 fractions
 *  sum to exactly 1. */
export interface CohortRace {
  run_total_s: number;
  /** By canonical station_index (2..16). All 8 present, each > 0. */
  station_s: Record<number, number>;
  roxzone_s: number;
  result_s: number;
}

/** The athlete's own latest singles race — the fallback budget basis AND the
 *  observed-prediction source. `complete` means it carries all 10 segments (so it
 *  can anchor a 'tu_carrera' budget). */
export interface OwnRace {
  race_id: number;
  date_iso: string | null;
  /** Whole days since the race (>= 0); null when the race has no date. */
  age_days: number | null;
  run_total_s: number | null;
  /** By canonical station_index (2..16); a value is null when that station
   *  wasn't recorded. */
  station_s: Record<number, number | null>;
  roxzone_s: number | null;
  result_s: number | null;
  complete: boolean;
}

/** One cross target (run or a station) from the training × race cross, reduced to
 *  what the prediction needs: the trained level and the competed value, both in
 *  the comparison basis (per_km run · per_500m erg · seconds functional). */
export interface TrainedLevel {
  slug: string;
  kind: TrainedKind;
  /** Trained reference in the comparison basis; null when the trained side gates. */
  trained_value_s: number | null;
  /** Competed value in the comparison basis; null when no race split. Feeds the
   *  personal transfer factor (race ÷ trained) where both exist. */
  race_value_s: number | null;
  /** Which evidence produced `trained_value_s` — carried through from the cross so
   *  the prediction can band it and name what would sharpen it. */
  source: EvidenceSource;
  /** The band widens a notch (treadmill mark, self-reported race). */
  weakened: boolean;
  /** The mark slug behind the trained value, when a measured mark produced it. */
  from_slug: string | null;
}

/** Everything the pure engine needs; assembled by the web loader. */
export interface GoalGapInput {
  goal_total_s: number;
  /** The 10 segments in render order (run, 8 stations, roxzone). */
  segments: SegmentDef[];
  /** Division/gender (else relaxed to singles) cohort; may be empty. */
  cohort: CohortRace[];
  own_race: OwnRace | null;
  /** Trained levels for the run + 8 stations (roxzone has none). */
  trained: TrainedLevel[];
}

/** One segment of the result: its budget, its prediction (null only when
 *  sin_datos — never a fabricated number), and their signed delta. */
export interface SegmentResult {
  slug: string;
  label_es: string;
  kind: SegmentKind;
  /** Seconds the segment must cost to hit the goal; the 10 sum to the goal.
   *  Null when no budget could be built — the PREDICTION no longer depends on
   *  one, so the segments exist either way. */
  budget_s: number | null;
  /** Predicted seconds; null iff tier === 'sin_datos'. */
  predicted_s: number | null;
  tier: PredictionTier;
  /** Which evidence produced `predicted_s`. */
  source: EvidenceSource;
  /** ± half-width of this segment's band, in seconds; null iff sin_datos. */
  band_s: number | null;
  /** predicted_s − budget_s (positive = over budget = time lost); null when either side is null. */
  delta_s: number | null;
}

/** How much of the race the projection can actually account for. */
export interface CoverageRead {
  /** Segments carrying a real prediction. */
  known: number;
  /** Segments in the skeleton (10). */
  total: number;
  /** Slugs with no evidence at all — the honest hole, named. */
  unknown_slugs: string[];
  /** true ⇔ every segment is predicted. ONLY then is a race total meaningful. */
  complete: boolean;
}

/** One measurement the athlete could supply, and what it would buy them. */
export interface NextInput {
  slug: string;
  label_es: string;
  /** What to do, in the athlete's words ("Mide tu SkiErg 1000"). */
  action_es: string;
  /** Seconds of band this removes. Null when the segment has NO number at all:
   *  the win there is filling a hole, not narrowing a band, and no honest size
   *  can be put on it before the athlete measures it. */
  band_gain_s: number | null;
}

/** The projection: a centre and a range, always emitted, never gated. */
export interface ProjectionRead {
  /** Σ of the predicted segments. When `coverage.complete` this IS the projected
   *  race time; otherwise it is the time we can account for and NOTHING MORE —
   *  reading it as a race total would understate by whatever is missing. */
  known_total_s: number;
  /** ± half-width around known_total_s, composed from the segments' bands. */
  band_s: number;
  low_s: number;
  high_s: number;
  /** Share of `known_total_s` backed by the athlete's own race/simulation splits
   *  (0–100). The spec's "confianza": how much of this is memory vs model. */
  observed_share_pct: number;
  /** What to measure next, best return first. */
  next_inputs: NextInput[];
}

/** The whole goal-gap read. `budget_source` null means the budget could not be
 *  built (no cohort and no own race); the PREDICTION side still stands. */
export interface GoalGapResult {
  budget_source: BudgetSource | null;
  segments: SegmentResult[];
  /**
   * The projected race time — Σ of the ten segments.
   *
   * NULL WHENEVER A SEGMENT IS UNKNOWN. It used to hold those segments at their
   * BUDGET, which is derived from the athlete's goal: a beginner with no station
   * data was quietly told their unmeasured stations would land exactly on target,
   * so the gap collapsed toward zero and the app congratulated them. A number
   * borrowed from the athlete's wish is worse than no number (ley 2).
   * `projection.known_total_s` + `coverage` carry the honest partial read.
   */
  predicted_total_s: number | null;
  /** predicted_total_s − goal_total_s (positive = predicted to miss the goal).
   *  Null exactly when `predicted_total_s` is. */
  gap_s: number | null;
  coverage: CoverageRead;
  projection: ProjectionRead;
}
