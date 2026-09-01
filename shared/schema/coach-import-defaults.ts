import { z } from 'zod';
import {
  IMPORT_DEFAULT_REP_MAX,
  IMPORT_DEFAULT_REP_MIN,
  IMPORT_DEFAULT_REST_MAX_S,
  IMPORT_DEFAULT_REST_MIN_S,
  IMPORT_DEFAULT_RIR_MAX,
  IMPORT_DEFAULT_RIR_MIN,
  type ImportDefaultsValues,
} from '../domain/coach-import-defaults';

// Wire schema for the coach's import-defaults editor.
//   GET /api/coach/import-defaults  → ImportDefaultsResponse
//   PUT /api/coach/import-defaults  ← importDefaultsPutSchema
// One source of truth for the shape shared by the route (server validation)
// and the dashboard editor. snake_case on the wire; validated server-side on
// write. Mirrors shared/schema/coach-guidance.ts.

const restSecondsSchema = z
  .number()
  .int()
  .min(IMPORT_DEFAULT_REST_MIN_S)
  .max(IMPORT_DEFAULT_REST_MAX_S);

const rirSchema = z.number().min(IMPORT_DEFAULT_RIR_MIN).max(IMPORT_DEFAULT_RIR_MAX);

const repCountSchema = z.number().int().min(IMPORT_DEFAULT_REP_MIN).max(IMPORT_DEFAULT_REP_MAX);

/**
 * PUT body — the full set of six defaults. Like `coach_guidance`, a save
 * always replaces the whole row: there is no partial patch, so the editor and
 * the importer can never disagree about which values are "the coach's".
 */
export const importDefaultsPutSchema = z
  .object({
    rest_strength_s: restSecondsSchema,
    rest_conditioning_s: restSecondsSchema,
    rest_core_mobility_s: restSecondsSchema,
    rir_strength: rirSchema,
    rep_range_min: repCountSchema,
    rep_range_max: repCountSchema,
  })
  .strict()
  .refine((v) => v.rep_range_min <= v.rep_range_max, {
    message: 'rep_range_min debe ser menor o igual que rep_range_max',
    path: ['rep_range_max'],
  });
export type ImportDefaultsPutInput = z.infer<typeof importDefaultsPutSchema>;

/** GET response: the resolved defaults + whether they are the coach's own
 *  edit or the system defaults (so the editor can label "usando los del
 *  sistema"), exactly like CoachGuidanceResponse. */
export interface ImportDefaultsResponse extends ImportDefaultsValues {
  /** true = a coach-authored row; false = the system defaults are being shown. */
  is_custom: boolean;
  updated_at: string | null;
}
