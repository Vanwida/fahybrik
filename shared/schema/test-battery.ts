import { z } from 'zod';

// #34 — the `store_results` CONTRACT: what a test session promises to measure.
//
// A calibration-test template carries this array on `templates.meta_json.store_results`.
// It is the single field that closes the broken loop:
//   1. non-empty array ⇒ `is_test = true` (the amber badge, derived in week-plan.ts);
//   2. it tells the ejecución→benchmark bridge EXACTLY which benchmark(s) the test
//      produces, in what unit, and what to calibrate with each.
// One test can promise SEVERAL results (the 1RM battery → squat + deadlift + bench),
// so this is an array of specs.

/** How the work of a test result is measured. A coach picks this per result.
 *  Only `time` and `load` CALIBRATE today (zones / 1RM). `distance`, `reps`,
 *  `calories` and `hrr` are storable as a baseline (`derives: 'none'`) — deriving
 *  zones from a distance-covered test or a 1RM from reps needs the segment's fixed
 *  parameter and is a follow-up on the bridge; `hrr` (heart-rate recovery) never
 *  calibrates, it's pure progression evidence. The coach UI constrains all of them
 *  to baseline. */
export const STORE_RESULT_MEASURES = ['time', 'distance', 'reps', 'calories', 'load', 'hrr'] as const;
export type StoreResultMeasure = (typeof STORE_RESULT_MEASURES)[number];

/** The unit the entered value is in. Pairs with `measure`
 *  (time→seconds, distance→meters, reps→reps, calories→calories, load→kg,
 *  hrr→bpm — bpm the HR dropped in the fixed recovery window). */
export const STORE_RESULT_UNITS = ['seconds', 'meters', 'reps', 'calories', 'kg', 'bpm'] as const;
export type StoreResultUnit = (typeof STORE_RESULT_UNITS)[number];

/** The ACTIVE calibration each result drives (level is always re-derived after,
 *  so it is not listed here). 'none' = a stored baseline (e.g. HYROX half-sim, or any
 *  distance/calorie result until the bridge learns to derive from it). Bike zones are
 *  intentionally absent — no bike zone model exists yet, so exposing it would be a dead
 *  option that never calibrates. */
export const STORE_RESULT_DERIVES = [
  'run_zones',
  'row_zones',
  'ski_zones',
  'strength_max',
  'none',
] as const;
export type StoreResultDerives = (typeof STORE_RESULT_DERIVES)[number];

/** Measures that currently CALIBRATE (drive a non-`none` derive). The coach UI uses this
 *  to force `derives: 'none'` for the others, so a coach can never author a test that
 *  silently fails to calibrate. */
export const CALIBRATING_MEASURES: readonly StoreResultMeasure[] = ['time', 'load'];

export const storeResultSpecSchema = z.object({
  // The canonical benchmark slug this result produces (run_5k, row_2k,
  // back_squat_1rm, hyrox_half_sim…). Must exist in benchmark-slugs / STRENGTH_LIFT_SLUGS.
  slug: z.string().min(1).max(60),
  unit: z.enum(STORE_RESULT_UNITS),
  measure: z.enum(STORE_RESULT_MEASURES),
  derives: z.enum(STORE_RESULT_DERIVES),
  // The modality for a zone derivation (run/row/ski). Omitted for strength/baseline.
  modality: z.enum(['run', 'row', 'ski', 'bike', 'strength', 'hyrox']).optional(),
  label: z.string().min(1).max(60),
  // An OPTIONAL result (#34): captured only if available — the app may auto-measure it
  // (e.g. HRR from the HR stream) or the athlete may skip it. It does NOT gate the test's
  // completion (battery-status counts only the required results). Absent = required.
  optional: z.boolean().optional(),
})
  // A coherence guard mirrored in the DB check + coach UI: only time/load may calibrate.
  .refine((s) => s.derives === 'none' || CALIBRATING_MEASURES.includes(s.measure), {
    message: 'Solo las medidas de tiempo o peso pueden calibrar (zonas / 1RM); el resto se guarda como baseline.',
    path: ['derives'],
  });
export type StoreResultSpec = z.infer<typeof storeResultSpecSchema>;

export const storeResultsSchema = z.array(storeResultSpecSchema);

// One entered value for a store_results slug, as posted by the capture step.
export const testResultEntrySchema = z.object({
  slug: z.string().min(1).max(60),
  // seconds for a time result, kg for a load result. Positive; capped generously.
  value: z.number().positive().max(360000),
});
export type TestResultEntry = z.infer<typeof testResultEntrySchema>;

export const recordTestResultsBodySchema = z.object({
  results: z.array(testResultEntrySchema).min(1).max(10),
});
export type RecordTestResultsBody = z.infer<typeof recordTestResultsBodySchema>;
