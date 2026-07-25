// Tipos + Zod del `guide.json` y el `manifest.json` de una SuuntoPlus Guide.
//
// FUENTE (spec oficial, sin login):
//   · Empaquetado y subida: "Suuntoplus Guide Cloud API" (PDF), secciones
//     "Prepare Suuntoplus Guide File" y "Create Suuntoplus Guide".
//   · Forma del guide.json: https://apizone.suunto.com/suuntoplus-guide-description
//     — el PDF remite explícitamente a ella ("More detailed specification of guide
//     json is provided in separate document").
//
// DISCREPANCIA IMPORTANTE ENTRE LAS DOS FUENTES (leer antes de tocar nada)
// -----------------------------------------------------------------------
// El ejemplo del PDF (de 2021) hace avanzar los pasos con una clave `trigger`:
//     { "type": "fields", "trigger": { "type": "stepDuration", "value": 600 } }
// La especificación detallada (la vigente, con ejemplos de 2023) NO documenta
// `trigger` en NINGÚN sitio: un FieldsStep avanza con `transitions`, una lista de
// { condition, stepId? } que se evalúa en orden y, sin `stepId`, pasa al paso
// siguiente. Emitimos `transitions` porque es lo que describe el documento al que
// el propio PDF delega. Es lo ÚNICO del formato que no podemos confirmar sin
// credenciales: si un reloj real ignorase las transiciones, la alternativa es
// emitir `trigger` con la misma condición.
//
// Todos los límites de longitud de abajo son los de la tabla oficial. Los
// aplicamos NOSOTROS antes de subir porque un guide inválido se responde con un
// 400 genérico ("Invalid step type: ...") que no dice qué campo se pasó: es mucho
// más barato fallar aquí, con el nombre del campo delante.

import { z } from 'zod';

// ── Límites publicados (tabla "Limits Summary" de la spec detallada) ─────────
export const GUIDE_LIMITS = {
  NAME_MAX: 60,
  DESCRIPTION_MAX: 256,
  SHORT_DESCRIPTION_MAX: 23,
  OWNER_MAX: 64,
  URL_MAX: 256,
  EXTERNAL_ID_MAX: 64,
  STEPS_MAX: 1000,
  REPEAT_TIMES_MIN: 1,
  REPEAT_TIMES_MAX: 100,
  ACTIVITIES_MAX: 100,
  STEP_TITLE_MAX: 13,
  NOTIFICATION_TITLE_MAX: 13,
  NOTIFICATION_TEXT_MAX: 54,
  FIELD_TITLE_MAX: 12,
  TEXT_FIELD_MAX: 54,
  /**
   * Por encima de esto el reloj deja de poder mostrar otros campos junto al texto
   * ("if >40 characters, other fields cannot be shown simultaneously"). No es un
   * error, es una degradación de pantalla: mantenemos el texto por debajo para no
   * perder el objetivo ni la cuenta atrás.
   */
  TEXT_FIELD_SOLO_ABOVE: 40,
} as const;

// ── Condiciones de avance ────────────────────────────────────────────────────
// Solo modelamos las tres que emitimos. La spec define además distance/duration
// (acumuladas de TODO el entreno, no del paso), location, routeCompleted,
// routeExited, or y and: no las generamos, así que no las declaramos.

/** Avanza cuando el atleta pulsa el botón de vuelta. */
const manualLapConditionSchema = z.object({ type: z.literal('manualLap') });

/** Metros recorridos DENTRO del paso actual. Unidad: metros. */
const stepDistanceConditionSchema = z.object({
  type: z.literal('stepDistance'),
  value: z.number().positive(),
});

/** Tiempo DENTRO del paso actual, sin contar pausas. Unidad: segundos. */
const stepDurationConditionSchema = z.object({
  type: z.literal('stepDuration'),
  value: z.number().positive(),
});

export const guideConditionSchema = z.discriminatedUnion('type', [
  manualLapConditionSchema,
  stepDistanceConditionSchema,
  stepDurationConditionSchema,
]);
export type GuideCondition = z.infer<typeof guideConditionSchema>;

export const guideTransitionSchema = z.object({
  condition: guideConditionSchema,
  /** Sin `stepId` se avanza al paso siguiente, que es siempre nuestro caso. */
  stepId: z.string().min(1).max(64).optional(),
});
export type GuideTransition = z.infer<typeof guideTransitionSchema>;

// ── Campos de pantalla ───────────────────────────────────────────────────────
// UNIDADES (spec detallada, sección "Field Types"). Las tres que nos importan y
// que NO son las obvias:
//   · targetPace  → METROS POR SEGUNDO. No es min/km: la propia spec avisa
//     "(not min/km; conversion required)". Ejemplo oficial: value 4.166 m/s.
//   · targetSpeed → m/s también (mismo número que pace; el reloj lo ROTULA
//     distinto). Por eso no emitimos los dos: sería el mismo objetivo dos veces.
//   · targetCadence → HERCIOS. El ejemplo oficial rotula min 1.4 / max 1.6 como
//     "84 - 96 RPM", o sea Hz = RPM / 60.

const fieldTitle = z.string().min(1).max(GUIDE_LIMITS.FIELD_TITLE_MAX).optional();

const textFieldSchema = z.object({
  type: z.literal('text'),
  value: z.string().min(1).max(GUIDE_LIMITS.TEXT_FIELD_MAX),
  title: fieldTitle,
});

const stepDurationCountdownFieldSchema = z.object({
  type: z.literal('stepDurationCountdown'),
  value: z.number().positive(), // segundos
  title: fieldTitle,
});

const stepDistanceCountdownFieldSchema = z.object({
  type: z.literal('stepDistanceCountdown'),
  value: z.number().positive(), // metros
  title: fieldTitle,
});

/** Medición en vivo. Sin `value`: es lo que el reloj está midiendo ahora. */
const measurementFieldSchema = z.object({
  type: z.enum(['heartRate', 'pace', 'cadence', 'distance', 'duration']),
  window: z.enum(['workout', 'step', 'manualLap']).optional(),
  aggregate: z.enum(['average', 'min', 'max']).optional(),
  title: fieldTitle,
});

/**
 * Objetivo con banda. La spec admite `value` (puntual) O `min`+`max` (banda).
 * Nosotros SIEMPRE emitimos banda: `WatchTarget` ya llega con min/max resueltos
 * (un objetivo puntual se expande con tolerancia aguas arriba), y un reloj no
 * alerta bien contra un valor exacto.
 */
const targetFieldSchema = z.object({
  type: z.enum(['targetHeartRate', 'targetPace', 'targetCadence']),
  value: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  title: fieldTitle,
});

export const guideFieldSchema = z.union([
  textFieldSchema,
  stepDurationCountdownFieldSchema,
  stepDistanceCountdownFieldSchema,
  measurementFieldSchema,
  targetFieldSchema,
]);
export type GuideField = z.infer<typeof guideFieldSchema>;

// ── Pasos ────────────────────────────────────────────────────────────────────

export const guideNotificationSchema = z.object({
  title: z.string().min(1).max(GUIDE_LIMITS.NOTIFICATION_TITLE_MAX),
  text: z.string().min(1).max(GUIDE_LIMITS.NOTIFICATION_TEXT_MAX),
});
export type GuideNotification = z.infer<typeof guideNotificationSchema>;

export const guideFieldsStepSchema = z.object({
  type: z.literal('fields'),
  id: z.string().min(1).max(64).optional(),
  /** Solo 13 caracteres: es un rótulo, no el nombre del tramo. */
  title: z.string().min(1).max(GUIDE_LIMITS.STEP_TITLE_MAX).optional(),
  /** Marca vuelta al EMPEZAR el paso (así cada tramo prescrito es un lap real). */
  createManualLap: z.boolean().optional(),
  fields: z.array(guideFieldSchema),
  transitions: z.array(guideTransitionSchema).optional(),
  notification: guideNotificationSchema.optional(),
});
export type GuideFieldsStep = z.infer<typeof guideFieldsStepSchema>;

/** Un `repeat` NO puede anidar otro repeat (spec: "no nested repeats"). */
export const guideRepeatStepSchema = z.object({
  type: z.literal('repeat'),
  id: z.string().min(1).max(64).optional(),
  times: z
    .number()
    .int()
    .min(GUIDE_LIMITS.REPEAT_TIMES_MIN)
    .max(GUIDE_LIMITS.REPEAT_TIMES_MAX),
  steps: z.array(guideFieldsStepSchema).min(1).max(GUIDE_LIMITS.STEPS_MAX),
});
export type GuideRepeatStep = z.infer<typeof guideRepeatStepSchema>;

export const guideStepSchema = z.discriminatedUnion('type', [
  guideFieldsStepSchema,
  guideRepeatStepSchema,
]);
export type GuideStep = z.infer<typeof guideStepSchema>;

// ── Guide + manifest ─────────────────────────────────────────────────────────

export const guideSchema = z.object({
  type: z.literal('sequence'),
  name: z.string().min(1).max(GUIDE_LIMITS.NAME_MAX),
  description: z.string().min(1).max(GUIDE_LIMITS.DESCRIPTION_MAX),
  shortDescription: z.string().min(1).max(GUIDE_LIMITS.SHORT_DESCRIPTION_MAX),
  owner: z.string().min(1).max(GUIDE_LIMITS.OWNER_MAX),
  url: z.string().url().max(GUIDE_LIMITS.URL_MAX),
  /** IDs de deporte Suunto (ver ACTIVITY_IDS en guide-builder). */
  activities: z.array(z.number().int().nonnegative()).min(1).max(GUIDE_LIMITS.ACTIVITIES_MAX).optional(),
  usage: z.literal('workout'),
  /** yyyy-MM-dd en hora LOCAL del atleta. */
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  externalId: z.string().min(1).max(GUIDE_LIMITS.EXTERNAL_ID_MAX).optional(),
  steps: z.array(guideStepSchema).min(1).max(GUIDE_LIMITS.STEPS_MAX),
});
export type SuuntoGuide = z.infer<typeof guideSchema>;

/**
 * `manifest.json`. El PDF lo pide en el ZIP junto al guide.json y el icono, y
 * repite cuatro campos del guide. `owner` DEBE coincidir con el nombre de la
 * aplicación en los ajustes OAuth (ver la nota del PDF y config.ts).
 */
export const guideManifestSchema = z.object({
  name: z.string().min(1).max(GUIDE_LIMITS.NAME_MAX),
  type: z.literal('sequence'),
  owner: z.string().min(1).max(GUIDE_LIMITS.OWNER_MAX),
  description: z.string().min(1).max(GUIDE_LIMITS.DESCRIPTION_MAX),
});
export type SuuntoGuideManifest = z.infer<typeof guideManifestSchema>;
