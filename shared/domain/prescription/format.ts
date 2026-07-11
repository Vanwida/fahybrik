// THE workout-format catalog — the SINGLE source of truth for the format/scheme
// vocabulary across the whole system (coach editor · domain model · DB enum ·
// iOS decode). Before this file the vocabulary diverged across five places
// (domain PrescriptionScheme, the DB `template_format` enum + its zod mirror,
// the iOS `WorkoutFormat` enum, and the editor picker), each adding/renaming
// values the others didn't have. This catalog kills that: every layer derives
// its enum + metadata from here, so a format added once is known everywhere.
//
// WHAT A "FORMAT" IS
// ------------------
// The shape of a block's work. A block has ONE format, shared by its lines, so
// the block-level "format" and a line's "scheme" are the SAME axis (see
// `PrescriptionScheme = WorkoutFormat` in types.ts). The format drives three
// downstream concerns, declared here as metadata so nothing re-derives them:
//   - `score`        — how the result is judged (time / rounds / pass-fail / …)
//   - `presentation` — how the live timer/HUD presents it (rotating vs fixed …)
//   - `params`       — which structural Prescription fields the editor exposes
//
// The live TIMERS for the new formats are NOT built here (that is a later step):
// transitionally a format with no dedicated timer falls back to the generic
// engine. But the catalog, the model, the DB and the iOS decode are in unison
// NOW, so adding a timer later is purely additive.

// How a format's result is scored.
export type FormatScore =
  | 'time' //            completion time — For Time, Chipper, Ladder, Rounds, HYROX sim
  | 'rounds_reps' //     rounds + partial reps in a fixed window — AMRAP, Tabata
  | 'pass_fail' //       each interval completed or not — EMOM
  | 'rounds_survived' // last round reached before failure — Death By
  | 'pace' //            pace / zone vs the prescription — Intervals, Steady
  | 'load' //            load moved across the set table — Strength
  | 'none'; //           unscored — Warm-up, Cool-down

// How the live engine presents the work (the primary metcon axis is rotating vs
// fixed-round; continuous / set_table / list cover the non-metcon families).
export type FormatPresentation =
  | 'rotating' //   work cycles on a fixed clock — EMOM, Tabata, Death By, Intervals
  | 'fixed' //      a fixed set of components done/repeated — For Time, AMRAP, Chipper, Ladder, Rounds, HYROX sim
  | 'continuous' // one unbroken bout — Steady
  | 'set_table' // explicit per-set strength table — Strength
  | 'list'; //     a plain checklist, no clock — Warm-up, Cool-down

export type FormatFamily = 'metcon' | 'endurance' | 'strength' | 'structural';

// The scalar structural fields a format consumes — drives which inputs the
// editor exposes for that format. The component/per-set list (`sets[]`) and the
// intensity `target` are available to every format and so are NOT listed here;
// these are the format-specific structural knobs.
export type FormatParam =
  | 'rounds' //     number of rounds / minutes
  | 'work_s' //     work-window length (EMOM minute, Tabata work, interval bout)
  | 'rest_s' //     rest between intervals / rounds
  | 'total_s' //    total time (AMRAP duration, Steady duration) or time CAP (For Time / Chipper / Ladder)
  | 'start' //      Death By — starting amount (reps/cal) in round 1
  | 'increment'; // Death By — amount added each round

export interface FormatMeta {
  /** English display label (Spanish copy lives in the per-surface label maps). */
  readonly label: string;
  readonly family: FormatFamily;
  readonly score: FormatScore;
  readonly presentation: FormatPresentation;
  readonly params: readonly FormatParam[];
}

// ── THE catalog ──────────────────────────────────────────────────────────────
// Order is the canonical display order (live formats first, then the additions,
// then the non-metcon block types). Editing THIS object propagates everywhere.
export const WORKOUT_FORMATS = {
  for_time: {
    label: 'For Time',
    family: 'metcon',
    score: 'time',
    presentation: 'fixed',
    params: ['rounds', 'total_s'],
  },
  amrap: {
    label: 'AMRAP',
    family: 'metcon',
    score: 'rounds_reps',
    presentation: 'fixed',
    params: ['total_s'],
  },
  emom: {
    label: 'EMOM',
    family: 'metcon',
    score: 'pass_fail',
    presentation: 'rotating',
    params: ['rounds', 'work_s'],
  },
  tabata: {
    label: 'Tabata',
    family: 'metcon',
    score: 'rounds_reps',
    presentation: 'rotating',
    params: ['work_s', 'rest_s', 'rounds'],
  },
  death_by: {
    label: 'Death By',
    family: 'metcon',
    score: 'rounds_survived',
    presentation: 'rotating',
    params: ['work_s', 'start', 'increment'],
  },
  intervals: {
    label: 'Intervals',
    family: 'endurance',
    score: 'pace',
    presentation: 'rotating',
    params: ['rounds', 'work_s', 'rest_s'],
  },
  steady: {
    label: 'Steady',
    family: 'endurance',
    score: 'pace',
    presentation: 'continuous',
    params: ['total_s'],
  },
  chipper: {
    label: 'Chipper',
    family: 'metcon',
    score: 'time',
    presentation: 'fixed',
    params: ['total_s'],
  },
  ladder: {
    label: 'Ladder',
    family: 'metcon',
    score: 'time',
    presentation: 'fixed',
    params: ['total_s'],
  },
  rounds: {
    label: 'Rounds',
    family: 'metcon',
    score: 'time',
    presentation: 'fixed',
    params: ['rounds', 'rest_s'],
  },
  hyrox_sim: {
    label: 'HYROX Sim',
    family: 'metcon',
    score: 'time',
    presentation: 'fixed',
    params: ['total_s'],
  },
  sets: {
    label: 'Strength',
    family: 'strength',
    score: 'load',
    presentation: 'set_table',
    params: ['rest_s'],
  },
  warmup: {
    label: 'Warm-up',
    family: 'structural',
    score: 'none',
    presentation: 'list',
    params: [],
  },
  cooldown: {
    label: 'Cool-down',
    family: 'structural',
    score: 'none',
    presentation: 'list',
    params: [],
  },
} as const satisfies Record<string, FormatMeta>;

/** The canonical format identifier — a key of the catalog. */
export type WorkoutFormat = keyof typeof WORKOUT_FORMATS;

/** Canonical keys in display order. */
export const WORKOUT_FORMAT_KEYS = Object.keys(WORKOUT_FORMATS) as WorkoutFormat[];

// ── Legacy values ─────────────────────────────────────────────────────────────
// Strings that older data / the DB enum still carry but the catalog no longer
// offers. They remain ACCEPTED on input and are normalized to a canonical
// member; they are never written by new code. There are NO orphans — every
// legacy value maps to exactly one canonical format.
//
//   strength_block → sets    (a strength block is the per-set strength table)
//   tempo          → steady  (a tempo effort is a continuous paced bout)
//   circuit        → rounds  (a circuit is rounds of stations)
//   test           → for_time (a benchmark test is a fixed effort scored by time)
//   interval       → intervals (the old singular spelling of the same format)
//   simulation     → hyrox_sim (older free-text label for a HYROX simulation;
//                    still seen in template_segments.block_format)
export const LEGACY_FORMAT_ALIASES: Readonly<Record<string, WorkoutFormat>> = {
  strength_block: 'sets',
  tempo: 'steady',
  circuit: 'rounds',
  test: 'for_time',
  interval: 'intervals',
  simulation: 'hyrox_sim',
};

// The legacy values that still exist as `template_format` ENUM members in the DB
// (so the zod mirror + the type stay in lock-step with the column). `interval`
// is NOT here — it was only ever a prescription `scheme`, never a DB enum value.
export const LEGACY_TEMPLATE_FORMATS = ['strength_block', 'tempo', 'circuit', 'test'] as const;
export type LegacyTemplateFormat = (typeof LEGACY_TEMPLATE_FORMATS)[number];

/** Every value the DB `template_format` enum accepts = canonical ∪ DB-legacy. */
export const TEMPLATE_FORMAT_VALUES = [
  ...WORKOUT_FORMAT_KEYS,
  ...LEGACY_TEMPLATE_FORMATS,
] as const;

/** Every string accepted on input (canonical + every legacy alias). */
export const ALL_FORMAT_INPUT_VALUES = [
  ...WORKOUT_FORMAT_KEYS,
  ...Object.keys(LEGACY_FORMAT_ALIASES),
] as string[];

/**
 * Normalize any format/scheme string to its canonical catalog member. Returns
 * `undefined` for a null/empty/unrecognized value (callers decide the fallback —
 * there is intentionally NO silent default here so unknowns are explicit).
 */
export function normalizeFormat(raw: string | null | undefined): WorkoutFormat | undefined {
  if (!raw) return undefined;
  if (raw in WORKOUT_FORMATS) return raw as WorkoutFormat;
  return LEGACY_FORMAT_ALIASES[raw];
}

/** Catalog metadata for a format, or undefined for an unknown string. */
export function formatMeta(raw: string | null | undefined): FormatMeta | undefined {
  const f = normalizeFormat(raw);
  return f ? WORKOUT_FORMATS[f] : undefined;
}

/** Formats of a given family, in catalog order (e.g. the metcon picker list). */
export function formatsByFamily(family: FormatFamily): WorkoutFormat[] {
  return WORKOUT_FORMAT_KEYS.filter((k) => WORKOUT_FORMATS[k].family === family);
}
