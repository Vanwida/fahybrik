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

/** How the athlete enters the number. */
export const STORE_RESULT_MEASURES = ['time', 'load'] as const;
export type StoreResultMeasure = (typeof STORE_RESULT_MEASURES)[number];

/** The ACTIVE calibration each result drives (level is always re-derived after,
 *  so it is not listed here). 'none' = a stored baseline (e.g. HYROX half-sim). */
export const STORE_RESULT_DERIVES = [
  'run_zones',
  'row_zones',
  'ski_zones',
  'strength_max',
  'none',
] as const;
export type StoreResultDerives = (typeof STORE_RESULT_DERIVES)[number];

export const storeResultSpecSchema = z.object({
  // The canonical benchmark slug this result produces (run_5k, row_2k,
  // back_squat_1rm, hyrox_half_sim…). Must exist in benchmark-slugs / STRENGTH_LIFT_SLUGS.
  slug: z.string().min(1).max(60),
  unit: z.enum(['seconds', 'kg', 'reps']),
  measure: z.enum(STORE_RESULT_MEASURES),
  derives: z.enum(STORE_RESULT_DERIVES),
  // The modality for a zone derivation (run/row/ski). Omitted for strength/baseline.
  modality: z.enum(['run', 'row', 'ski', 'bike', 'strength', 'hyrox']).optional(),
  label: z.string().min(1).max(60),
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
