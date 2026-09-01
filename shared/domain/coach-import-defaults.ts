// @fahybrid/shared/domain/coach-import-defaults — the coach's editable
// "rellenos" for importing a week from a PHOTO.
//
// The vision step TRANSCRIBES a coach's screenshot; the shared notation
// grammar (./import/*) TYPES only what the photo actually shows and never
// guesses (the honesty contract — see ./import/result.ts). But a photo often
// crops, blurs, or simply never states three things a coach writes once and
// repeats by habit across a whole block: the rest between sets, how close to
// failure a strength set goes, and the rep count when a cell shows sets but
// no number. Leaving those blank makes the imported item BLOCKING or ADVISORY
// per `./prescription/completeness.ts` — not executable, or executable but
// silently under-specified. So the importer fills the gap with a value below,
// and flags the item as PROPOSED so the coach confirms or overrides it in the
// review grid — it never ships un-reviewed.
//
// AGNOSTIC BY CONTRACT: these are METHOD, not mechanism (see FAHYBRIK's HARD
// RULE Nº0). Another coach runs a different rest protocol or a different
// default proximity-to-failure. So every value here is a SYSTEM DEFAULT —
// served until the coach overrides it via `coach_import_defaults` (migration
// tracked alongside this file) — never a `const` baked into the importer.
// Same rule, same shape as ./coach-guidance.ts.
//
// WHAT IS DELIBERATELY NOT HERE (considered and excluded, not overlooked):
//   - An endurance target (pace / HR zone). Unlike rest or RIR, a pace is not
//     a template shape a coach reuses — it is athlete- and day-specific. A
//     "default pace" would not fill a gap, it would silently fabricate the
//     one number the coach never wrote. Missing endurance targets stay
//     `advisory` and go to the coach in the review grid, never guessed.
//   - A rest default for `functional` (WOD/metcon). Those schemes are CAPPED
//     (amrap/emom/for_time — see completeness.ts `CAPPED_SCHEMES`); their
//     dose is the cap itself, not a per-set rest. Inventing one would mean
//     inventing how long the coach meant the workout to run.
//   - A default TIME for a timed set with no number ("plank 3x" with no
//     seconds). Unlike a missing rep COUNT (below), a missing DURATION is not
//     a template habit — it is the one number that defines the set. That gap
//     stays `review`.

/** One row per coach (`coach_import_defaults`, unique on `coach_id`). Every
 *  field is required — a save always replaces the whole set, exactly like
 *  `coach_guidance`'s "the whole list is replaced" contract. */
export interface ImportDefaultsValues {
  /** Rest between strength sets when the photo shows none. */
  rest_strength_s: number;
  /** Rest between conditioning intervals (run/row/ski/bike repeats) when the
   *  photo shows none. */
  rest_conditioning_s: number;
  /** Rest inside a core/mobility circuit when the photo shows none. */
  rest_core_mobility_s: number;
  /** Proximity-to-failure (RIR) for a strength set with no stated intensity —
   *  the same slot `parseEffortTarget` types when the coach DOES write one
   *  (./import/dose.ts). */
  rir_strength: number;
  /** Rep count floor when a set shows no reps at all — a set is still typed
   *  as a RANGE (`measure.max`, see prescription/types.ts), never a single
   *  invented point, so the coach sees it was filled, not measured. */
  rep_range_min: number;
  rep_range_max: number;
}

// ── Bounds (named, not magic — enforced again as DB CHECKs) ────────────────
/** A rest above this is not "between sets" — it is a different block. */
export const IMPORT_DEFAULT_REST_MIN_S = 0;
export const IMPORT_DEFAULT_REST_MAX_S = 600; // 10 min sanity ceiling
/** RIR practical range; the wire `Target` schema tolerates up to 50 (any
 *  coach-TYPED value), but a DEFAULT above 10 is never a sane fallback. */
export const IMPORT_DEFAULT_RIR_MIN = 0;
export const IMPORT_DEFAULT_RIR_MAX = 10;
/** A single set's rep count sanity ceiling (mirrors the reasoning behind
 *  `MAX_SETS` in prescription/types.ts). */
export const IMPORT_DEFAULT_REP_MIN = 1;
export const IMPORT_DEFAULT_REP_MAX = 50;

/**
 * The system defaults, served whenever the coach has authored no row of their
 * own. Generic, load-agnostic values with no brand, coach, or athlete name —
 * chosen to be the most common baseline across general strength/hybrid
 * programming, never a specific methodology's number:
 *
 *   - 90s strength rest: long enough for near-full recovery on a submaximal
 *     set (no load/intensity is known, so nothing riskier is assumable),
 *     short enough not to inflate a session's real length.
 *   - 60s conditioning rest: interval work runs a tighter work:rest ratio
 *     than max-strength; 60s is the common "moderate interval" default.
 *   - 30s core/mobility rest: these circuits are meant to flow — 30s keeps
 *     it a circuit rather than turning it into strength-length rest.
 *   - RIR 2: "2 reps in the tank" is the most common default proximity to
 *     failure for general strength/hypertrophy work with an unknown 1RM —
 *     hard enough to train, safe enough to prescribe blind.
 *   - 8-12 reps: the classic load-agnostic hypertrophy/general-strength band,
 *     used when a cell shows sets but no rep count survived the photo.
 */
export const DEFAULT_IMPORT_DEFAULTS: ImportDefaultsValues = {
  rest_strength_s: 90,
  rest_conditioning_s: 60,
  rest_core_mobility_s: 30,
  rir_strength: 2,
  rep_range_min: 8,
  rep_range_max: 12,
};

/** The default values, as a fresh copy (callers may spread/mutate freely). */
export function defaultImportDefaults(): ImportDefaultsValues {
  return { ...DEFAULT_IMPORT_DEFAULTS };
}
