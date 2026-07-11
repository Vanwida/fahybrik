// @fahybrid/shared/domain/race-transfer — TYPES.
//
// The training × race CROSS: for each HYROX effort (the 8 stations + the run on
// foot) it puts the COMPETED side (the athlete's split in a `singles` race)
// next to the TRAINED side (what the athlete does in training), tagged with the
// evidence tier used so the reading is never a fabricated number.
//
// Everything is computed by the pure `computeRaceTransfer` (no DB, no I/O) so it
// is exhaustively unit-testable. The web loader fetches the rows and hands them
// in; iOS/web format the numeric output into display strings.

/** Prior-work cut (seconds) that separates a FRESH effort from a FATIGUED one.
 *  A training effort with < this much work before it in the same session (or the
 *  session's very first effort) reads as fresh capacity; ≥ this reads as done
 *  under accumulated fatigue. A HYROX simulation is always fatigued regardless. */
export const FRESH_PRIOR_WORK_MAX_S = 300;

/** A race ergometer split (SkiErg / Row) is 1000 m sustained; the zone-profile
 *  threshold + the erg training pace are per 500 m. Divide the race split by this
 *  to compare like-for-like. */
export const ERG_RACE_SPLIT_METERS = 1000;
export const ERG_PACE_UNIT_METERS = 500;

/** Canonical format of a HYROX-simulation block — always a fatigued context. */
export const FATIGUE_CONTEXT_FORMAT = 'hyrox_sim';
/** Fresh-eligible block formats (a steady run, an interval rep, a strength set).
 *  Only these can read as `fresco`, and only when the prior-work gate also passes. */
export const FRESH_CONTEXT_FORMATS: readonly string[] = ['steady', 'intervals', 'sets'];

/** Which evidence backs the trained side, best-available first. */
export type TransferTier = 'observado' | 'estimado' | 'sin_datos';

/** The unit both sides are compared in for one effort.
 *   · per_km    — running pace (race run laps vs run training pace / threshold)
 *   · per_500m  — erg pace (race 1 km split ÷2 vs erg training pace / threshold)
 *   · seconds   — a functional station's raw duration (race split vs practice) */
export type TransferUnit = 'per_km' | 'per_500m' | 'seconds';

/** How an effort maps to the training side.
 *   · run/ski/row — matched by MODALITY (a pace), can fall back to a threshold
 *   · functional  — matched by the station EXERCISE (a practice duration) */
export type StationKind = 'run' | 'ski' | 'row' | 'functional';

/** A single training effort for one station, already reduced to the station's
 *  native unit (pace for run/erg, duration for functional). */
export interface ObservedEffort {
  /** Native-unit value: s/km (run) · s/500m (erg) · seconds of practice (functional). */
  value_s: number;
  /** Canonical block format the effort belonged to (format.ts vocabulary), null when unknown. */
  context_format: string | null;
  /** Seconds of work in the same session BEFORE this effort (fatigue proxy), null when not measurable. */
  prior_work_s: number | null;
  /** Position within the session (0-based); the first effort is 0. */
  position: number;
}

/** One cross target (the run, or one of the 8 stations) with everything the pure
 *  function needs to build its trained side and read its competed split. */
export interface StationTransferInput {
  /** 0 for the run aggregate, else the canonical station_index (2,4,…,16). */
  index: number;
  slug: string;
  /** ES label ("Row 1km", "Wall ball 100", "Carrera a pie"). */
  label: string;
  kind: StationKind;
  /** station_splits[].index to read the competed split; null for the run (uses the lap mean). */
  race_index: number | null;
  observed: ObservedEffort[];
  /** Zone-profile threshold in the station's native unit; null for functional / when absent. */
  threshold_s: number | null;
}

export interface RaceTransferInput {
  /** The athlete's latest `singles` race with splits (doubles are excluded upstream). */
  race:
    | {
        id: number;
        name: string;
        date: string | null;
        /** 8 run laps in seconds (may be partial / contain zeros). */
        run_splits: number[];
        /** The 8 station splits keyed by canonical index (2..16). */
        station_splits: Array<{ index: number; seconds: number | null }>;
      }
    | null;
  /** True when the athlete has races but ALL of them are doubles (honest gate). */
  only_doubles: boolean;
  /** The run + 8 stations, in the order they should surface. */
  stations: StationTransferInput[];
}

export interface TrainedContextValues {
  /** Fresh-context training value (native unit): BEST for paced, mean for functional; null when none. */
  fresco_s: number | null;
  /** Fatigued-context training value (native unit): BEST for paced, mean for functional; null when none. */
  fatigado_s: number | null;
}

export interface TrainedEvidence {
  tier: TransferTier;
  /** The trained reference used for the delta (native unit); null when sin_datos. */
  value_s: number | null;
  /** Unit of value_s + race_seconds; null only when sin_datos. */
  unit: TransferUnit | null;
  /** Fresh vs fatigued observed split — populated whenever there are classified
   *  efforts (so it can accompany an `estimado` threshold headline too), null when
   *  none. For a paced kind these are BEST efforts; for functional, means. */
  contexto: TrainedContextValues | null;
  /** Count of CLASSIFIED training efforts backing the context (0 for sin_datos;
   *  may be > 0 for `estimado` when observed efforts sit behind the threshold). */
  n_efforts: number;
}

export interface StationTransfer {
  index: number;
  slug: string;
  label: string;
  kind: StationKind;
  unit: TransferUnit;
  /** Competed value in the comparison basis (erg ÷2 → per_500m, run = lap mean); null when no race / no split. */
  race_seconds: number | null;
  race_date: string | null;
  race_name: string | null;
  trained: TrainedEvidence;
  /** (race − trained) / trained × 100, rounded. Positive = slower in the race (loses). Null when either side is missing. */
  transfer_delta_pct: number | null;
}

export type RaceTransferAvailability = 'ok' | 'no_singles_race' | 'only_doubles';

export interface RaceTransferResult {
  availability: RaceTransferAvailability;
  race_id: number | null;
  race_name: string | null;
  race_date: string | null;
  /** The run + 8 stations. Trained side is always populated; race/delta null when no singles race. */
  stations: StationTransfer[];
}
