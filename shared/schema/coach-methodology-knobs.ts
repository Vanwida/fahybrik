import { z } from 'zod';
import {
  ADDRESS_FORMS,
  BLOCK_END_POLICIES,
  DEFAULT_TEST_SLUGS_MAX,
  DEFAULT_TEST_SLUG_MAX,
  HRV_DROP_PCT_MAX,
  HRV_DROP_PCT_MIN,
  HR_ANCHORS,
  HR_ZONE_COUNT_MAX,
  HR_ZONE_COUNT_MIN,
  LOAD_TSB_FLOOR_MAX,
  LOAD_TSB_FLOOR_MIN,
  RUN_PACE_ANCHORS,
  SLEEP_MIN_HOURS_MAX,
  SLEEP_MIN_HOURS_MIN,
  TONE_REGISTERS,
  type CoachMethodologyKnobs,
} from '../domain/coach/methodology-knobs';

// Contrato de cable de los 5 mandos de metodología.
//   GET /api/coach/methodology/knobs  → CoachMethodologyKnobsResponse
//   PUT /api/coach/methodology/knobs  ← coachMethodologyKnobsPutSchema
// Una sola fuente para la ruta (validación en servidor) y para el editor.
// snake_case. Guardar reemplaza el conjunto entero, como import-defaults.

const testSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(DEFAULT_TEST_SLUG_MAX)
  .regex(/^[a-z][a-z0-9_]*$/, 'slug de test inválido');

/**
 * Cuerpo del PUT: los 5 mandos ENTEROS. Sin parche por campo, para que el
 * editor y una lectura posterior no puedan discrepar sobre cuáles son «los
 * del coach».
 */
export const coachMethodologyKnobsPutSchema = z
  .object({
    zones: z
      .object({
        hr_zone_count: z.number().int().min(HR_ZONE_COUNT_MIN).max(HR_ZONE_COUNT_MAX),
        hr_anchor: z.enum(HR_ANCHORS),
        run_pace_anchor: z.enum(RUN_PACE_ANCHORS),
      })
      .strict(),
    default_tests: z
      .array(testSlugSchema)
      .max(DEFAULT_TEST_SLUGS_MAX)
      .superRefine((slugs, ctx) => {
        if (new Set(slugs).size !== slugs.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tests duplicados' });
        }
      }),
    block_end_policy: z.enum(BLOCK_END_POLICIES),
    day_down: z
      .object({
        sleep_min_hours: z.number().min(SLEEP_MIN_HOURS_MIN).max(SLEEP_MIN_HOURS_MAX),
        hrv_drop_pct: z.number().min(HRV_DROP_PCT_MIN).max(HRV_DROP_PCT_MAX),
        load_tsb_floor: z.number().min(LOAD_TSB_FLOOR_MIN).max(LOAD_TSB_FLOOR_MAX),
      })
      .strict(),
    tone: z
      .object({
        register: z.enum(TONE_REGISTERS),
        address_form: z.enum(ADDRESS_FORMS),
      })
      .strict(),
  })
  .strict();

export type CoachMethodologyKnobsPutInput = z.infer<typeof coachMethodologyKnobsPutSchema>;

/** Respuesta del GET: los 5 mandos resueltos + si son suyos o los del sistema. */
export interface CoachMethodologyKnobsResponse extends CoachMethodologyKnobs {
  /** true = fila escrita por el coach; false = se están sirviendo los del sistema. */
  is_custom: boolean;
  updated_at: string | null;
}
