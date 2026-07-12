// @fahybrid/shared/domain/dobles-gap — TYPES.
//
// The GOAL side of the HYROX DOUBLES loop, for a PAIR. It mirrors the singles
// goal-gap (shared/domain/goal-gap) but reads a race as two athletes sharing it:
//
//   · the SEGMENTS are the same 10 (1 run · 8 stations · 1 roxzone);
//   · each athlete has a SOLO prediction per segment (reused verbatim from the
//     singles predict layer — observado/estimado/sin_datos), goal-independent;
//   · a CARRIER says who does each segment (both together on the runs/roxzone,
//     one athlete or a split on each station), so the PAIR-predicted time of a
//     segment is derived from the two solos + the carrier;
//   · the BUDGET decomposes the pair's goal segment by segment, and the gap is
//     read as pair-predicted − budget, exactly like singles.
//
// Everything here is computed by the pure functions in this folder (no DB, no
// I/O). The web loader (web/lib/athlete/dobles-gap.ts) fetches the rows — the two
// athletes' solos, the pair's reparto, the doubles cohort — and hands them in.

import type { CohortRace, PredictionTier, SegmentDef, SegmentKind } from '../goal-gap';

export type { CohortRace, PredictionTier, SegmentDef, SegmentKind } from '../goal-gap';

/** Who executes a segment, from the READING athlete's frame:
 *   · together — both do it in full (the runs + roxzone; the slower governs);
 *   · self / partner — one athlete carries the whole station;
 *   · split — the station is shared (self_share to the reader). */
export type DoblesSegmentCarrier = 'together' | 'self' | 'partner' | 'split';

/** One athlete's solo prediction for one segment — the exact output of the
 *  singles predict layer (predicted_s null iff tier === 'sin_datos'). */
export interface SoloPrediction {
  predicted_s: number | null;
  tier: PredictionTier;
}

/** The reader-centric reparto for one station (2..16). */
export interface StationCarrier {
  /** Reader frame: they do it / partner does it / shared. */
  carrier: 'self' | 'partner' | 'split';
  /** The READING athlete's share of the station, 0..1 (partner = 1 − this). */
  self_share: number;
}

/** A race reduced to segment seconds — the fraction source for the budget. The
 *  exact shape raceFractions() consumes; run + roxzone totals + the 8 station
 *  seconds keyed by canonical station_index. */
export interface RaceFractionSource {
  run_total_s: number;
  station_s: Record<number, number>;
  roxzone_s: number;
}

/** Everything the pure engine needs; assembled by the web loader. */
export interface DoblesGapInput {
  /** The pair's shared goal for this doubles race; null → no goal set yet. */
  goal_total_s: number | null;
  /** The 10 segments in render order (run, 8 stations, roxzone). */
  segments: SegmentDef[];
  /** Reader (authenticated athlete) solo predictions, aligned to `segments`. */
  self_solos: SoloPrediction[];
  /** Partner solo predictions, aligned to `segments`. */
  partner_solos: SoloPrediction[];
  /** Reader-centric carrier by station_index; a station absent → 50/50 split. */
  carriers: Map<number, StationCarrier>;
  /** Doubles cohort near the goal (division/gender, else doubles-only); may be empty. */
  cohort_doubles: CohortRace[];
  /** The reader's own last complete doubles race (fraction fallback #2). */
  own_doubles: RaceFractionSource | null;
  /** The faster athlete's own complete singles race (fraction fallback #3). */
  faster_singles: RaceFractionSource | null;
}

/** Where the per-segment BUDGET fractions came from, best first. Internal (not on
 *  the wire) — kept for honesty in tests and diagnostics. */
export type DoblesBudgetSource =
  | 'cohorte_dobles'
  | 'tu_dobles'
  | 'singles_referencia'
  | 'prediccion'
  | 'reparto_uniforme';

/** How complete the read is (the loader adds 'no_pair' before calling the engine). */
export type DoblesAvailability = 'ok' | 'partial' | 'no_data';

/** One segment of the pair read. */
export interface DoblesSegmentResult {
  slug: string;
  label_es: string;
  kind: SegmentKind;
  /** Canonical station index (2..16) for a station; null for run / roxzone. */
  station_index: number | null;
  carrier: DoblesSegmentCarrier;
  /** Reader's share (self→1, partner→0, split→share); null for run / roxzone. */
  self_share: number | null;
  /** Seconds the segment must cost to hit the goal; when goal is null this is the
   *  pair prediction itself (so the bar still has scale). The 10 close to the goal. */
  budget_s: number;
  /** The pair's predicted seconds for this segment. Held at budget_s when the
   *  segment is sin_datos (a required side has no prediction) — mirrors singles. */
  pair_predicted_s: number;
  /** Each athlete's solo prediction for this segment; null when sin_datos for
   *  that athlete. Feed the live slider recompute in the app. */
  self_solo_s: number | null;
  partner_solo_s: number | null;
  tier: PredictionTier;
}

/** The whole pair goal-gap read. */
export interface DoblesGapResult {
  availability: DoblesAvailability;
  goal_s: number | null;
  /** Σ pair_predicted_s; null when no_data (nothing to stand on). */
  predicted_total_s: number | null;
  budget_source: DoblesBudgetSource | null;
  segments: DoblesSegmentResult[];
}
