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

/** Cohort races needed before a division/gender aggregate is trustworthy. */
export const MIN_COHORT_RACES = 5;

/** A singles race counts as RECENT (its splits are a live prediction) when it is
 *  younger than this. Older races still inform the estimate (they anchor the
 *  personal transfer factor) but never stand in as the observed prediction. */
export const RECENT_RACE_DAYS = 180;

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
 *   · observado — the athlete's own recent (< RECENT_RACE_DAYS) race split.
 *   · estimado  — trained level scaled to a full split × personal race-tax factor
 *                 (or a stale own-race value / cohort typical for roxzone).
 *   · sin_datos — nothing to stand on; no fabricated number. */
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

/** One segment of the result: its budget (always), its prediction (null only when
 *  sin_datos — never a fabricated 0), and their signed delta. */
export interface SegmentResult {
  slug: string;
  label_es: string;
  kind: SegmentKind;
  /** Seconds the segment must cost to hit the goal. Always present; the 10 sum to the goal. */
  budget_s: number;
  /** Predicted seconds; null iff tier === 'sin_datos'. */
  predicted_s: number | null;
  tier: PredictionTier;
  /** predicted_s − budget_s (positive = over budget = time lost); null iff predicted_s null. */
  delta_s: number | null;
}

/** The whole goal-gap read. `budget_source` null (and empty segments) means the
 *  budget could not be built (no cohort and no own race) → the endpoint gates. */
export interface GoalGapResult {
  budget_source: BudgetSource | null;
  segments: SegmentResult[];
  /** Σ (predicted_s ?? budget_s): the sin_datos segments are held at BUDGET, i.e.
   *  "if you hold the plan where we can't see you". Null when no budget. */
  predicted_total_s: number | null;
  /** predicted_total_s − goal_total_s (positive = predicted to miss the goal). */
  gap_s: number | null;
}
