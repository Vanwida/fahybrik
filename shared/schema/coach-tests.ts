import { z } from 'zod';

import { templateFormat } from './_primitives';
import { STORE_RESULT_MEASURES, STORE_RESULT_UNITS } from './test-battery';
import { editorBlockInputSchema } from './program-templates';

// El CONTENIDO real del test (docs/DECISIONS.md, 2026-08-08): bloques con
// ejercicio + Prescription, el mismo shape de escritura que el editor de día
// (`EditorBlockInput`) — un test es un entreno de verdad, no texto libre.
// Reutiliza el tipo en vez de duplicarlo: un test y un día comparten el mismo
// vocabulario de bloque/serie/objetivo. Opcional y con default []: un test sin
// contenido cae al mecanismo automático de siempre (ver calibration-content.ts).
export const coachTestContentSchema = z.array(editorBlockInputSchema).max(8);
export type CoachTestContent = z.infer<typeof coachTestContentSchema>;

// #34 — the WRITE contract for a coach's calibration test (the /api/coach/tests
// surface). The coach never types a raw benchmark slug: a result is EITHER a
// CALIBRATION target (picked from the fixed CALIBRATION_TARGETS catalog — slug /
// measure / unit / modality are derived server-side so calibration can never
// silently fail) OR a BASELINE number (the coach picks how it's measured; it is
// stored, not calibrated — deriving zones/1RM from distance/reps/calories is #44).
// The write layer (web/lib/coach/write-coach-test.ts) resolves each result to a
// normalized StoreResultSpec and re-checks coherence against the catalog.

/** One result the coach configures for a test. Discriminated by `kind`. */
export const coachTestResultInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('calibration'),
    /** A CALIBRATION_TARGETS key (run_zones | row_zones | ski_zones | <lift>_1rm). */
    target: z.string().min(1).max(60),
    /** Optional coach label override; defaults to the target's result_label. */
    label: z.string().min(1).max(60).optional(),
    /** Mark the result as OPTIONAL (does not gate the test's completion). Absent = required. */
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('baseline'),
    measure: z.enum(STORE_RESULT_MEASURES),
    unit: z.enum(STORE_RESULT_UNITS),
    label: z.string().min(1).max(60),
    /** Mark the result as OPTIONAL (does not gate the test's completion). Absent = required. */
    optional: z.boolean().optional(),
  }),
]);
export type CoachTestResultInput = z.infer<typeof coachTestResultInputSchema>;

/** One scheduled occurrence: which week of the athlete's plan + weekday
 *  (1 = Mon … 7 = Sun). A test may have several (re-tests in weeks 1, 6, 12…).
 *
 *  `week_offset = 0` es la SEMANA CERO: los días entre que el coach asigna el
 *  plan y el lunes que arranca (migración 0157). Ahí el `day_of_week` es una
 *  PREFERENCIA, no una promesa — la ventana mide de 1 a 7 días según el día en
 *  que se asigne, así que lo que no cabe se desliza al siguiente hueco libre y
 *  lo que no entra se informa. 1+ sigue siendo la semana N del plan, 1-based. */
export const coachTestScheduleInputSchema = z.object({
  week_offset: z.number().int().min(0).max(52),
  day_of_week: z.number().int().min(1).max(7),
  enabled: z.boolean().default(true),
  /** Días libres que esta pieza pide DETRÁS. Un test duro pide 1; una movilidad 0. */
  rest_days_after: z.number().int().min(0).max(3).default(0),
});
export type CoachTestScheduleInput = z.infer<typeof coachTestScheduleInputSchema>;

// Reject duplicate (week_offset, day_of_week) occurrences early with a clean
// message (the DB also enforces it via a unique constraint).
const uniqueSchedule = (schedule: CoachTestScheduleInput[]): boolean => {
  const seen = new Set<string>();
  for (const s of schedule) {
    const key = `${s.week_offset}-${s.day_of_week}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
};

export const coachTestCreateSchema = z.object({
  name: z.string().min(1).max(120),
  protocol: z.string().max(4000).nullable().optional(),
  format: templateFormat,
  enabled: z.boolean().default(true),
  content: coachTestContentSchema.default([]),
  // Opcional desde que el contenido manda: lo que un test mide se DEDUCE de lo
  // que el coach fijó al construirlo (test-derive.ts) — fijas 1000 m, se mide el
  // tiempo. Se sigue aceptando explícito para los tests sembrados y para
  // cualquier caller que ya lo calculaba; ausente + contenido = deducido.
  results: z.array(coachTestResultInputSchema).min(1).max(10).optional(),
  schedule: z
    .array(coachTestScheduleInputSchema)
    .max(20)
    .default([])
    .refine(uniqueSchedule, { message: 'Hay dos ocurrencias en la misma semana y día.' }),
});
/** Shape ya PARSEADO (defaults aplicados) — lo que consume el writer. Para
 *  construir un payload a mano, usar `CoachTestCreateInput`. */
export type CoachTestCreate = z.infer<typeof coachTestCreateSchema>;
export type CoachTestCreateInput = z.input<typeof coachTestCreateSchema>;

export const coachTestUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  protocol: z.string().max(4000).nullable().optional(),
  format: templateFormat.optional(),
  enabled: z.boolean().optional(),
  // Autoritativo desde el input cuando se envía, como `results`: el editor manda
  // su contenido completo cada vez que guarda. Ausente (no `undefined` explícito
  // en el body) = no tocar el contenido existente — distinto de `[]`, que SÍ lo
  // vacía. Ver write-coach-test.ts.
  content: coachTestContentSchema.optional(),
  results: z.array(coachTestResultInputSchema).min(1).max(10).optional(),
  schedule: z
    .array(coachTestScheduleInputSchema)
    .max(20)
    .refine(uniqueSchedule, { message: 'Hay dos ocurrencias en la misma semana y día.' })
    .optional(),
});
export type CoachTestUpdate = z.infer<typeof coachTestUpdateSchema>;

/** Reorder the coach's tests: the full ordered list of test ids (sort_order = index). */
export const coachTestReorderSchema = z.object({
  ordered_ids: z.array(z.union([z.string(), z.number()])).min(1).max(50),
});
export type CoachTestReorder = z.infer<typeof coachTestReorderSchema>;
