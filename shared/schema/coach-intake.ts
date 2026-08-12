import { z } from 'zod';
import { idSchema, isoDate } from './_primitives';

// Intake commit payload — Pablo's signed-off decisions for a new athlete.
//
// The flow is described in /docs/ux/11-coach-athlete-intake.md. The five steps
// produce one transaction: macrocycle persist + level assignment + tests
// scheduled + welcome message dispatched. Skipping the welcome message is
// allowed; skipping macrocycle/level/tests is not (they are required for the
// athlete to be active in the cohort).

// Bordes de un tramo del alta. Una sola fuente para el validador del servidor y
// para los controles de la pantalla, que antes repetían los mismos números a mano.
export const INTAKE_WEEKS_MIN = 1;
export const INTAKE_WEEKS_MAX = 20;
/** Cuántos tramos puede llegar a tener la estructura que se decide en el alta. */
export const INTAKE_TRAMOS_MAX = 8;
/** Largo máximo del nombre que el coach le pone a un tramo. */
export const INTAKE_TRAMO_NAME_MAX = 60;

export const intakeBlockSpecSchema = z.object({
  // Microciclo NAME (coach data / agnostic) — e.g. "Microciclo 1". Not a catalogued phase.
  type: z.string().min(1).max(INTAKE_TRAMO_NAME_MAX),
  weeks: z.number().int().min(INTAKE_WEEKS_MIN).max(INTAKE_WEEKS_MAX),
});
export type IntakeBlockSpec = z.infer<typeof intakeBlockSpecSchema>;

/**
 * DE QUÉ NACE EL PLAN DEL ATLETA AL DARLE DE ALTA. Dos caminos con el mismo peso:
 *
 *  · `shared`   — sigue la periodización que el coach ya tiene montada: el alta
 *                 materializa un microciclo de su BIBLIOTECA. Es el defecto, y
 *                 es lo que hacía el alta antes de que existiera esta elección.
 *  · `personal` — un plan solo para este atleta. El alta NO inventa microciclos:
 *                 el esqueleto nace cuando el coach planifica en la ficha. Aquí
 *                 solo se marca que no sigue la periodización compartida.
 *
 * La clasificación nivel×días se guarda igual en los dos: es dato del atleta,
 * no solo insumo de la matriz.
 *
 * Si el cliente manda `block_specs` en modo personal, cada tramo SÍ se crea
 * (el coach escribió un esqueleto de verdad). Vacío o ausente = aún no hay.
 */
export const INTAKE_PLAN_MODES = ['shared', 'personal'] as const;
export const intakePlanModeSchema = z.enum(INTAKE_PLAN_MODES);
export type IntakePlanMode = z.infer<typeof intakePlanModeSchema>;
export const INTAKE_PLAN_MODE_DEFAULT: IntakePlanMode = 'shared';

export const ATHLETE_LEVELS = [1, 2, 3, 4] as const;
export const athleteLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type AthleteLevel = z.infer<typeof athleteLevelSchema>;

export const intakeBaselineTestSchema = z.object({
  // Test slug — keys into a coach-defined catalog (HRV baseline, sleep tracking,
  // HYROX simulation half, 1RM update, …). Free-form so we can extend without
  // schema churn.
  slug: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
  scheduled_for: isoDate.nullable(),
  // `auto` tests are passive (HRV / sleep tracked from device); `programmed`
  // tests are workouts Pablo schedules.
  kind: z.enum(['auto', 'programmed']),
});
export type IntakeBaselineTest = z.infer<typeof intakeBaselineTestSchema>;

export const intakeWelcomeSchema = z.object({
  send: z.boolean(),
  body: z.string().max(2000).nullable(),
});
export type IntakeWelcome = z.infer<typeof intakeWelcomeSchema>;

export const intakeCommitSchema = z
  .object({
    target_event_id: idSchema,
    // El esqueleto no se exige: inventarlo en el alta es mentir. En modo
    // personal, si el coach ya lo tiene, puede mandarlo; si no, la lista
    // vacía deja al atleta en personal sin contenedores.
    block_specs: z.array(intakeBlockSpecSchema).max(INTAKE_TRAMOS_MAX).default([]),
    level: athleteLevelSchema,
    baseline_tests: z.array(intakeBaselineTestSchema).max(20),
    welcome: intakeWelcomeSchema,
    acknowledged_warnings: z.array(z.string().max(120)).default([]),
    notes: z.string().max(2000).nullable().default(null),
    plan_mode: intakePlanModeSchema.default(INTAKE_PLAN_MODE_DEFAULT),
    month_template_id: idSchema.optional(),
    month_start_date: isoDate.optional(),
  })
  .superRefine((v, ctx) => {
    // Los dos modos son excluyentes por definición: un plan personal no nace de
    // una plantilla de la biblioteca. Rechazarlo aquí evita un pago ambiguo en
    // el que el servidor tendría que elegir por su cuenta cuál gana.
    if (v.plan_mode === 'personal' && v.month_template_id != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['month_template_id'],
        message: 'Un plan personal no se asigna desde una plantilla de la biblioteca',
      });
    }
  });
export type IntakeCommit = z.infer<typeof intakeCommitSchema>;
/** Lo que MANDA el cliente: los campos con valor por defecto son opcionales
 *  aquí y obligatorios en `IntakeCommit` (lo que devuelve el validador). */
export type IntakeCommitInput = z.input<typeof intakeCommitSchema>;

// What we surface in `intake_notes_json` after commit. Snapshot of decisions
// so a future audit can see what Pablo signed off without re-querying.
export const intakeNotesSnapshotSchema = z.object({
  level: athleteLevelSchema,
  /** De qué nació el plan. Ausente en las altas anteriores a esta elección: se
   *  leen como `shared`, que es literalmente lo que hacían. */
  plan_mode: intakePlanModeSchema.default(INTAKE_PLAN_MODE_DEFAULT),
  block_specs: z.array(intakeBlockSpecSchema),
  baseline_tests: z.array(intakeBaselineTestSchema),
  acknowledged_warnings: z.array(z.string()),
  welcome_sent: z.boolean(),
  notes: z.string().nullable(),
  committed_at: z.string(),
});
export type IntakeNotesSnapshot = z.infer<typeof intakeNotesSnapshotSchema>;
