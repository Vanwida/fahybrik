import { z } from 'zod';
import {
  assignmentStatus,
  biometricSource,
  executionRecordingMethod,
  idSchema,
  isoDate,
  isoDateTime,
  partnerVisibility,
} from './_primitives';
import { prescriptionSchema, targetSchema } from '../domain/prescription';
import { STORE_RESULT_MEASURES, STORE_RESULT_UNITS, STORE_RESULT_DERIVES } from './test-battery';

// Dobles HYROX station assignment (reparto).
//
// SOURCE: DERIVED at read from the coach's `dobles_simulations` (single source
// of truth) by the athlete assignment-detail endpoint — see
// web/lib/athlete/dobles-station-split.ts. It is NOT stored on
// `workout_assignments.station_assignment`; that column is LEGACY / never
// written (migration 0091 documents it on the column). Do not add a writer.
//
// 'a' / 'b' identify the two partners deterministically (the application layer
// maps a/b to user IDs via `my_role`); 'split' means the station is shared
// (`self_share` = the reading athlete's fraction); the legacy 'alternate' value
// stays accepted so older payloads keep validating.
//
// This schema is TOLERANT by design: the legacy fields (`name`, `assigned_to`)
// still validate, and the derived per-station fields (`label`, `station_index`,
// `template_segment_id`, `self_share`, `note`) are optional additions so no
// existing payload breaks.
export const stationAssignmentEntrySchema = z.object({
  // Legacy display field (== `label`); kept for back-compat with clients that
  // require it. Optional so a lean derived payload can omit it.
  name: z.string().min(1).max(80).optional(),
  // Canonical HYROX station label, e.g. "SkiErg 1km".
  label: z.string().min(1).max(80).optional(),
  assigned_to: z.enum(['a', 'b', 'alternate', 'split']),
  // Canonical HYROX station index (2,4,…,16), from dobles_simulations.
  station_index: z.number().int().optional(),
  // The template_segments.id of the session line that IS this station, so the
  // client attributes the reparto to the exact segment it executes.
  template_segment_id: z.number().int().optional(),
  // The READING athlete's share of this station, 0..1 (partner = 1 − this).
  self_share: z.number().min(0).max(1).optional(),
  // Coach's per-station reparto note ("alterna 250m"), or null.
  note: z.string().nullable().optional(),
});
export type StationAssignmentEntry = z.infer<typeof stationAssignmentEntrySchema>;

export const stationAssignmentSchema = z.object({
  // 'a' | 'b' — which side of the pair the READING user is (== dobles_simulations
  // athlete_a/b). Optional so legacy payloads (no role) still validate.
  my_role: z.enum(['a', 'b']).optional(),
  // #23 — partner's first name for the live relay line. Optional/nullable so
  // legacy payloads still validate.
  partner_first_name: z.string().nullable().optional(),
  stations: z.array(stationAssignmentEntrySchema),
});
export type StationAssignment = z.infer<typeof stationAssignmentSchema>;

export const workoutAssignmentSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  microcycle_id: idSchema.nullable(),
  scheduled_for: isoDate,
  template_id: idSchema,
  template_version: z.number().int().min(1),
  status: assignmentStatus,
  notes: z.string().max(4000).nullable(),
  // LEGACY / NEVER WRITTEN. The Dobles reparto is DERIVED at read from
  // dobles_simulations (see stationAssignmentSchema above + migration 0091 which
  // documents this on the column). This column has no writer and stays NULL;
  // it's kept only so the row schema still parses the DB shape. Do not add a
  // writer — derive the reparto instead.
  station_assignment: stationAssignmentSchema.nullable(),
  // Whether this assignment is shared with the paired partner (default) or
  // private to the assigned athlete. DB default is 'shared' so legacy rows
  // keep behaving as before.
  partner_visibility: partnerVisibility,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type WorkoutAssignment = z.infer<typeof workoutAssignmentSchema>;

export const workoutExecutionSchema = z.object({
  id: idSchema,
  // Null = sesión importada (HealthKit/Garmin/…) que nadie prescribió.
  // El plan no la toca. Única por assignment cuando existe (índice parcial 0191).
  assignment_id: idSchema.nullable(),
  athlete_id: idSchema,
  started_at: isoDateTime.nullable(),
  ended_at: isoDateTime.nullable(),
  total_duration_seconds: z.number().int().nonnegative().nullable(),
  perceived_exertion: z.number().int().min(1).max(10).nullable(),
  notes: z.string().max(4000).nullable(),
  // Metcon/HYROX final score (migration 0069). score_time_s for For Time / RFT /
  // HYROX-sim; score_rounds (+ score_reps) for AMRAP. Null for non-scored formats.
  score_time_s: z.number().int().nonnegative().nullable(),
  score_rounds: z.number().int().nonnegative().nullable(),
  score_reps: z.number().int().nonnegative().nullable(),
  source: biometricSource.nullable(),
  source_workout_ref: z.string().max(200).nullable(),
  // Joint HYROX Dobles link (migration 0074): the partner this execution was
  // logged with, else null (the solo-logging default). bigint FK → idSchema.
  partner_athlete_id: idSchema.nullable(),
  // Per-GROUP data provenance after a multi-source FUSION (migration 0108, #36).
  // When a device skeleton and a screenshot→IA capture are fused into ONE
  // execution these say WHICH source owns each group of fields — the honesty the
  // coach and the deferred reconciler need. `source` stays the legacy whole-row
  // provenance (== totals_source for single-source rows). RPE is always the
  // athlete and segments carry their own per-row `source`, so neither needs a
  // header column (Fork B: no dead weight). Tolerant/optional so pre-0108 row
  // shapes and partial constructors keep parsing.
  totals_source: biometricSource.nullable().optional(),
  score_source: biometricSource.nullable().optional(),
  // Every provider that contributed ≥1 value (the fused-state signal: length ≥ 2
  // ⇒ a genuine fusion). Defaults to [] so older selects still parse.
  contributing_sources: z.array(biometricSource).optional().default([]),
  // HOW the record came to exist (migration 0144) — run in the app, typed in
  // afterwards, or ingested from a third party. Deliberately SEPARATE from
  // `source`, which only says which APPARATUS produced the numbers: answering
  // both with one column is what made live PM5 sessions read as "a mano".
  // Nullable ("no se sabe") for rows written before 0144 and for seed data.
  recorded_via: executionRecordingMethod.nullable().optional(),
  // ── La cabecera MEDIDA de la sesión (migración 0154) ──────────────────────
  //
  // Hasta 0154 esta tabla guardaba duración, RPE, notas y marcador, y nada más.
  // Eso es lo que mantenía el TSS atado al RPE: `training-load/tss.ts` tiene los
  // modos por potencia/FTP y por FC/LTHR escritos y con tests, y su comentario
  // explica que no disparan porque "there is no HR column, no power column".
  // Estos campos son ESE dato. Son también lo que Polar ya nos manda (calorías,
  // distancia) y se descartaba al no haber dónde ponerlo.
  //
  // Todos nullable y optional: "no se sabe" es null, jamás un 0 (§7 del contrato
  // de UI), y optional para que un select parcial o un payload viejo siga
  // parseando. NO hay campo de TSS ni de IF: dependen del umbral y del FTP del
  // atleta, que cambian con cada test, así que se calculan al leer — guardarlos
  // los dejaría mintiendo sobre todo el histórico.
  avg_hr: z.number().int().min(30).max(260).nullable().optional(),
  max_hr: z.number().int().min(30).max(260).nullable().optional(),
  min_hr: z.number().int().min(30).max(260).nullable().optional(),
  avg_power_w: z.number().nonnegative().nullable().optional(),
  total_distance_m: z.number().nonnegative().nullable().optional(),
  total_calories: z.number().nonnegative().nullable().optional(),
  // Separados y no netos: subir 300 y bajar 300 no es un llano, y el neto lo
  // borraría. Tres fuentes nos los dan hoy (altitud del GPS, el Elevation Gain
  // del characteristic FTMS, el HKWorkoutRoute del propio reloj) y ninguna se lee.
  elevation_gain_m: z.number().nonnegative().nullable().optional(),
  elevation_loss_m: z.number().nonnegative().nullable().optional(),
  // Tiempo EN MOVIMIENTO, distinto del total. Sin él, la media de un entreno con
  // transiciones miente: es exactamente lo que produce un "42:25 min/km" en un
  // brick — dividir el tiempo entero, paradas incluidas, por la distancia.
  moving_seconds: z.number().int().nonnegative().nullable().optional(),
  // Caída de pulso (lpm) 60 s tras el esfuerzo — una DELTA, no un pulso
  // absoluto (por eso su rango no es 30-260 como avg_hr: mig 0181 corrigió el
  // mismo bug en el CHECK de la base, copiado de la fila de arriba). 0-150:
  // `HRRecoveryCapture` ya descarta una caída negativa antes de guardar nada.
  // `computeHrRecovery60` (shared/domain/running) espeja su mismo criterio.
  hr_recovery_60_bpm: z.number().int().min(0).max(150).nullable().optional(),
  // Deriva cardíaca (Pa:HR), en %. Se GUARDA —y no se calcula al leer— porque
  // exige recorrer la traza entera y la traza no cambia nunca. El coach ya tiene
  // un `decoupling_target_pct` editable que hasta ahora no alimentaba nada.
  decoupling_pct: z.number().nullable().optional(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type WorkoutExecution = z.infer<typeof workoutExecutionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// La TRAZA de una sesión (tabla `workout_traces`, migración 0156).
//
// El eje del tiempo: la serie de una señal a lo largo de la sesión. Es lo que
// convierte un puñado de medias en un entreno del que se puede preguntar
// cualquier cosa — deriva, recuperación, la curva, los splits por kilómetro, el
// reparto real de zonas contra el umbral de HOY del atleta.
//
// UNA FILA POR (ejecución, señal, fuente), con la serie entera dentro. No fila
// por muestra: ese es el patrón que `workout_routes` ya estableció aquí y el que
// usan los formatos del sector (FIT, TCX). Medido: 632 muestras de 51 minutos
// ocupan 785 bytes comprimidas.
//
// EL EJE VA EXPLÍCITO en `offsets_s` porque la cadencia real no es fija: las
// muestras que llegan hoy van a ~4,9 s de media con huecos de hasta 81 s. Asumir
// un intervalo obligaría a rellenar esos huecos, y rellenarlos es fabricar dato.
// Con el eje explícito el hueco SE VE y quien lee decide si hay cobertura.
//
// La FUENTE va en la clave a propósito: la FC de la correa y la del reloj son
// dos medidas distintas del mismo fenómeno y conviven sin pisarse; quien lee
// elige por fidelidad (`execution-merge/precedence.ts` ya tiene ese ranking).
// ─────────────────────────────────────────────────────────────────────────────

export const TRACE_SIGNALS = [
  'hr', // bpm
  'pace', // s/km
  'speed', // m/s — unidad nativa de cinta y bici
  'power', // W
  'cadence', // pasos o paladas por minuto
  'altitude', // m sobre el nivel del mar
  'distance', // m acumulados
] as const;
export type TraceSignal = (typeof TRACE_SIGNALS)[number];

/** Una traza tal y como la sube el cliente o la reconstruye el servidor. */
export const workoutTraceSchema = z.object({
  signal: z.enum(TRACE_SIGNALS),
  source: biometricSource,
  started_at: isoDateTime,
  offsets_s: z.array(z.number().int().nonnegative()).min(1),
  values: z.array(z.number().finite()).min(1),
});
export type WorkoutTrace = z.infer<typeof workoutTraceSchema>;

/**
 * La misma traza con la garantía de que los dos arrays describen los mismos
 * puntos. Se valida aquí y no solo en la base para que el error salga con un
 * mensaje útil en el borde, no como una violación de constraint 200 ms después.
 */
export const workoutTraceInputSchema = workoutTraceSchema.superRefine((t, ctx) => {
  if (t.offsets_s.length !== t.values.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `traza desalineada: ${t.offsets_s.length} instantes y ${t.values.length} valores`,
      path: ['values'],
    });
  }
});

// Raw lap-level data preserved for audit. Free-form by design — provider shape varies.
export const rawLapDataSchema = z.object({
  laps: z
    .array(
      z.object({
        index: z.number().int().nonnegative().optional(),
        start_time: isoDateTime.optional(),
        duration_seconds: z.number().nonnegative().optional(),
        distance_meters: z.number().nonnegative().optional(),
        avg_hr: z.number().int().optional(),
        max_hr: z.number().int().optional(),
        calories: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  source: z.string().optional(),
}).passthrough();
export type RawLapData = z.infer<typeof rawLapDataSchema>;

// Honest-logging vocabulary — the SINGLE SOURCE of the three states a logged
// unit of work can be in, shared coach↔athlete↔DB↔wire (web ingest re-exports
// these). NULL actual ⇔ 'skipped'; a real 0 is legal only for open/AMRAP score-
// reps. Mirrors the CHECK constraints on segment_executions / set_executions.
export const REPS_STATUSES = ['done', 'scaled', 'skipped'] as const;
export type RepsStatus = (typeof REPS_STATUSES)[number];

// Rx/Scaled toggle for metcon-family blocks (whole-block scaling).
export const RX_SCALED_VALUES = ['rx', 'scaled'] as const;
export type RxScaled = (typeof RX_SCALED_VALUES)[number];

// Provenance of a segment's PULSE specifically (migration 0153) — distinct from
// `biometricSource` (_primitives.ts), which is a whole-EXECUTION brand/apparatus
// enum ('concept2', 'garmin'...). This is the narrower vocabulary the live
// engine's HR-ownership latch (`WorkoutSession.HRSource` / `injectLiveHR`)
// already resolves per instant: a generic BLE chest/arm strap, the Apple
// Watch/iPhone via HealthKit, or a strap paired through the PM5. NULL on a
// segment means no HR was measured, or the row predates this column.
export const HR_SOURCES = ['strap', 'healthkit', 'pm5'] as const;
export type HrSource = (typeof HR_SOURCES)[number];

// One working set of a strength segment (table `set_executions`). The parent
// segment keeps the back-compat aggregate (reps_completed = Σ reps_actual,
// weight_used_kg = representative load); this carries the per-set honest detail.
export const setExecutionSchema = z.object({
  id: idSchema,
  segment_execution_id: idSchema,
  set_index: z.number().int().min(1),
  reps_prescribed: z.number().int().nonnegative().nullable(),
  // NULL only when the set was skipped — never a fabricated 0.
  reps_actual: z.number().int().nonnegative().nullable(),
  load_prescribed_kg: z.number().nonnegative().nullable(),
  load_actual_kg: z.number().nonnegative().nullable(),
  rpe: z.number().min(0).max(10).nullable(),
  rir: z.number().min(0).max(10).nullable(),
  status: z.enum(REPS_STATUSES),
  confirmed: z.boolean(),
  tempo: z.string().nullable(),
  rest_s: z.number().int().nonnegative().nullable(),
  // Serie de aproximación (card 155 / mig 0207). Optional so a select previo a
  // 0207 o un constructor parcial sigue parseando. Ausente = trabajo.
  is_approach: z.boolean().optional().default(false),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type SetExecution = z.infer<typeof setExecutionSchema>;

export const segmentExecutionSchema = z.object({
  id: idSchema,
  execution_id: idSchema,
  template_segment_id: idSchema.nullable(),
  position: z.number().int().nonnegative(),
  started_at: isoDateTime.nullable(),
  ended_at: isoDateTime.nullable(),
  // ACTUAL completed reps (NULL when skipped) — the legacy alias for reps_actual.
  reps_completed: z.number().int().nonnegative().nullable(),
  weight_used_kg: z.number().nonnegative().nullable(),
  distance_meters: z.number().nonnegative().nullable(),
  calories: z.number().nonnegative().nullable(),
  avg_hr: z.number().int().min(30).max(260).nullable(),
  max_hr: z.number().int().min(30).max(260).nullable(),
  // Provenance of avg_hr/max_hr specifically (migration 0153) — nullable AND
  // optional so a SELECT against a DB where the migration hasn't run yet (the
  // column simply absent from the row) still parses.
  hr_source: z.enum(HR_SOURCES).nullable().optional(),
  // Per-segment modality + modality-native intensity (migration 0045). The DB
  // columns are all nullable (plain text / numeric, no CHECK). `modality` is free
  // text on the column (writes are normalized to run|row|ski|bike|strength|other);
  // `source` is this segment's ingestion provenance, distinct from the execution's
  // biometric_source enum. Matched here so the wire contract stops dropping them.
  modality: z.string().nullable(),
  avg_pace_s_per_km: z.number().nonnegative().nullable(),
  avg_pace_s_per_500m: z.number().nonnegative().nullable(),
  avg_power_w: z.number().nonnegative().nullable(),
  stroke_rate_spm: z.number().nonnegative().nullable(),
  source: z.string().nullable(),
  // Honest-logging fields (migration 0088). reps_confirmed / is_structural are
  // NOT NULL with a default, so always present; the rest are nullable.
  reps_prescribed: z.number().int().nonnegative().nullable(),
  reps_status: z.enum(REPS_STATUSES).nullable(),
  reps_confirmed: z.boolean(),
  is_structural: z.boolean(),
  rx_scaled: z.enum(RX_SCALED_VALUES).nullable(),
  scaled_note: z.string().nullable(),
  raw_lap_data_json: rawLapDataSchema.nullable(),
  reconciled_at: isoDateTime.nullable(),
  reconciled_by_user_id: idSchema.nullable(),
  // ── La RONDA (migración 0155) ────────────────────────────────────────────
  //
  // Cuál de las repeticiones del bloque es esta fila. 0 significa "esto no se
  // repite" (una serie de carrera, un ejercicio suelto, una pieza continua), NO
  // "la primera": la primera ronda de un circuito de tres es 1. Así se distingue
  // "no aplica" de "la primera de varias" sin ir a mirar la prescripción.
  //
  // Hasta 0155 el unique era (execution_id, position) y hacía FÍSICAMENTE
  // imposible guardar un circuito por rondas. El motor ya calculaba el parcial de
  // cada ronda y lo pintaba en vivo; se borraba al guardar por no tener sitio.
  //
  // OJO al leer: con esto la relación ejecución↔prescripción deja de ser 1:1 por
  // posición y pasa a ser 1:N. Todo lo que empareja tramos con el plan tiene que
  // agregar por ronda o enseñará el mismo ejercicio repetido.
  round_index: z.number().int().nonnegative().default(0),
  // ── Columnas que EXISTEN en la tabla y este contrato no reflejaba ────────
  //
  // Auditado el 6-ago-2026: la tabla tenía doce columnas que el zod no declaraba,
  // así que quien diseñaba mirando el contrato en vez de la tabla se quedaba
  // ciego a la mitad de lo que ya guardamos. Todas optional para no romper ningún
  // payload ni select parcial existente.
  //
  // Contexto del tramo (migración 0120).
  context_format: z.string().nullable().optional(),
  context_source: z.enum(['block', 'session']).nullable().optional(),
  exercise_id: idSchema.nullable().optional(),
  prescription_snapshot: z.unknown().nullable().optional(),
  /** Trabajo acumulado antes de este tramo, en segundos — el predictor lo usa. */
  prior_work_s: z.number().int().nonnegative().nullable().optional(),
  // Específicos de carrera y cinta (migración 0124).
  incline_pct: z.number().min(0).max(30).nullable().optional(),
  run_cadence_spm: z.number().min(100).max(250).nullable().optional(),
  // EMOM (migración 0134).
  emom_rounds_completed: z.number().int().nonnegative().nullable().optional(),
  emom_rounds_prescribed: z.number().int().nonnegative().nullable().optional(),
  // Atribución de una carrera estructurada (migración 0146). Van las tres juntas
  // o ninguna — la tabla lo impone con un CHECK all-or-none.
  leg_index: z.number().int().nonnegative().nullable().optional(),
  leg_role: z.enum(['work', 'recovery']).nullable().optional(),
  leg_phase: z.enum(['warmup', 'main', 'cooldown']).nullable().optional(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type SegmentExecution = z.infer<typeof segmentExecutionSchema>;

// =============================================================================
// Assignment detail (GET /api/athlete/assignments/[id]/detail)
//
// Athlete-facing pre-workout payload. iOS parses this in PreWorkoutBriefView /
// ActiveWorkoutView to render sets/reps/load/RPE/pace/etc. per item. The
// /api/athlete/plan/week endpoint only ships the short card; this one is the
// full hydration.
//
// `workout` is null when the assignment has no template (defensive — DB FK is
// currently NOT NULL, but the contract preserves a rest-day fallback).
// =============================================================================

// Spec-normalized params shape — DB columns use `weight_kg` / `weight_pct_1rm`
// / `time_seconds`; the wire contract exposes `load_kg` / `load_pct` /
// `duration_seconds`. All fields optional; the loader emits only those
// present on the source segment.
export const assignmentDetailParamsSchema = z.object({
  sets: z.number().int().positive().optional(),
  reps: z.number().int().nonnegative().optional(),
  load_kg: z.number().nonnegative().optional(),
  load_pct: z.number().min(0).max(200).optional(),
  rpe: z.number().min(1).max(10).optional(),
  rest_seconds: z.number().int().nonnegative().optional(),
  duration_seconds: z.number().int().nonnegative().optional(),
  distance_km: z.number().nonnegative().optional(),
  distance_meters: z.number().nonnegative().optional(),
  pace_sec_per_km: z.number().nonnegative().optional(),
  cadence_spm: z.number().nonnegative().optional(),
  calories: z.number().nonnegative().optional(),
  calories_per_min: z.number().nonnegative().optional(),
  hr_zone: z.number().int().min(1).max(7).optional(),
});
export type AssignmentDetailParams = z.infer<typeof assignmentDetailParamsSchema>;

// G1 — a zone target (@Zn) resolved to the athlete's ABSOLUTE pace band, read
// from their versioned zone profile for the line's modality (run → /km; ergo →
// /500m). `zone_label` is the coach zone code (Z4, or "Z3–Z4" for a span);
// `range_label` is the ready-to-render pace string with unit ("4:15–4:25/km",
// "> 2:17/500m"); raw seconds let iOS reformat. Present only when the line targets
// a zone AND the athlete has a profile for that modality.
export const resolvedIntensitySchema = z.object({
  zone_label: z.string().min(1),
  range_label: z.string().min(1),
  fast_s: z.number().nonnegative(),
  slow_s: z.number().nonnegative().nullable(),
  pace_unit: z.enum(['per_km', 'per_500m']),
  // True when these zones come from an UNCONFIRMED auto profile (derived from the
  // athlete's onboarding benchmarks, pending the coach's review). Defaulted false
  // for backward-compat with payloads built before the field existed.
  needs_review: z.boolean().default(false),
});
export type ResolvedIntensity = z.infer<typeof resolvedIntensitySchema>;

// The strength analog of resolvedIntensity: a %RM target resolved to the athlete's
// ABSOLUTE kg from their current 1RM (athlete_strength_maxes, read never
// recomputed). `pct_label` is the source percentage ("80%", "65–80%"); `kg_label`
// is the ready-to-render load ("64 kg", "52–64 kg"); raw `min_kg`/`max_kg`
// (max null for a single value) + `one_rm_kg` let iOS reformat. Present only when
// the line targets a %RM on a tracked lift AND the athlete has a 1RM for it.
export const resolvedLoadSchema = z.object({
  pct_label: z.string().min(1),
  kg_label: z.string().min(1),
  min_kg: z.number().nonnegative(),
  max_kg: z.number().nonnegative().nullable(),
  one_rm_kg: z.number().positive(),
  // True when the 1RM is from an UNCONFIRMED source (a strength max pending the
  // coach's review). Defaulted false for payloads built before the field existed.
  needs_review: z.boolean().default(false),
});
export type ResolvedLoad = z.infer<typeof resolvedLoadSchema>;

// Card 130 — el porqué de un objetivo relativo («a peso de competición»),
// ya resuelto a ESTE atleta. El número viaja en `prescription_json.target`
// (el campo de siempre). Esta lista es la frase. Vacía si no había relativo.
export const resolvedReferenceSchema = z.object({
  phrase: z.string().min(1),
  target: targetSchema.nullable(),
  source: z.string().nullable(),
  estimated: z.boolean(),
});
export type ResolvedReference = z.infer<typeof resolvedReferenceSchema>;

export const assignmentDetailItemSchema = z.object({
  uid: z.string().min(1),
  exercise_id: idSchema,
  exercise_name: z.string(),
  exercise_slug: z.string(),
  exercise_category: z.string(),
  exercise_video_url: z.string().nullable(),
  cues: z.string().nullable(),
  // La DESCRIPCIÓN larga del ejercicio — el apunte del coach que explica el
  // gesto y da el consejo. Como `cues` y el vídeo, sale del merge por coach
  // (`coalesce(override, base)`), así que es la voz de ESE coach.
  //
  // Se editaba, se guardaba y NUNCA se servía: iOS la decodifica desde hace
  // tiempo y `ExerciseDetailView` tiene su sección «DESCRIPCIÓN» construida,
  // que salía siempre vacía porque el endpoint no la emitía (7-ago-2026).
  exercise_description: z.string().nullable(),
  // Flat, iOS-ready targets. Derived from `prescription_json` (the unified
  // measure/target model) when present on the segment, else from the stored
  // scalar params. Carries the reps/load/zone/pace/distance/calories the thin
  // params alone used to drop.
  params_json: assignmentDetailParamsSchema,
  // Structured per-set prescription, passed through verbatim when valid so iOS
  // can decode the rich form (per-set pyramids, ranges, pace units) later.
  // Null for legacy segments that only have scalar params.
  prescription_json: prescriptionSchema.nullable(),
  // G1 — the line's zone target resolved to an absolute pace band, or null.
  resolved_intensity: resolvedIntensitySchema.nullable(),
  // The line's %RM target resolved to the athlete's absolute kg, or null.
  resolved_load: resolvedLoadSchema.nullable(),
  // Card 130 — frases de los objetivos relativos de esta línea. Ausente en
  // payloads anteriores. El iOS viejo ignora la clave. El builder del día
  // siempre emite el array (vacío si no había relativo).
  resolved_references: z.array(resolvedReferenceSchema).optional(),
  notes: z.string().nullable(),
});
export type AssignmentDetailItem = z.infer<typeof assignmentDetailItemSchema>;

export const assignmentDetailBlockSchema = z.object({
  uid: z.string().min(1),
  title: z.string(),
  format: z.string(),
  block_position: z.number().int().nonnegative(),
  coach_note: z.string().nullable(),
  // Block-level config (rounds, time_cap_seconds, work_seconds, rest_seconds,
  // …). Free-form per-format payload; the studio currently writes {} until
  // per-block config lands.
  config_json: z.record(z.unknown()),
  items: z.array(assignmentDetailItemSchema),
});
export type AssignmentDetailBlock = z.infer<typeof assignmentDetailBlockSchema>;

export const assignmentDetailWorkoutSchema = z.object({
  name: z.string(),
  focus: z.string().nullable(),
  coach_note: z.string().nullable(),
  estimated_duration_minutes: z.number().int().nonnegative().nullable(),
  blocks: z.array(assignmentDetailBlockSchema),
});
export type AssignmentDetailWorkout = z.infer<typeof assignmentDetailWorkoutSchema>;

// #34 — one calibration result to capture for a test session (mirrors
// coach_test_results / storeResultSpecSchema). `measure`/`unit` drive the iOS
// capture input + the value's interpretation on POST back; `derives`/`modality`
// document what it calibrates (routing lives server-side, in the bridge). Kept a
// dedicated schema (not the refined storeResultSpecSchema) so a null modality from
// the DB parses cleanly.
export const assignmentDetailStoreResultSchema = z.object({
  slug: z.string(),
  label: z.string(),
  measure: z.enum(STORE_RESULT_MEASURES),
  unit: z.enum(STORE_RESULT_UNITS),
  derives: z.enum(STORE_RESULT_DERIVES),
  modality: z.string().nullable().optional(),
});
export type AssignmentDetailStoreResult = z.infer<typeof assignmentDetailStoreResultSchema>;

export const assignmentDetailResponseSchema = z.object({
  assignment: z.object({
    id: idSchema,
    athlete_id: idSchema,
    scheduled_for: isoDate,
    status: assignmentStatus,
    slot: z.string().nullable(),
    template_id: idSchema.nullable(),
    template_version: z.number().int().min(1).nullable(),
    completed_at: isoDateTime.nullable(),
    perceived_exertion: z.number().int().min(1).max(10).nullable(),
    // Dobles HYROX reparto, DERIVED at read from dobles_simulations for a HYROX-
    // simulation session (see stationAssignmentSchema). Null for individual /
    // non-simulation sessions or when no simulation is authored.
    station_assignment: stationAssignmentSchema.nullable(),
    // Which side of the pair the reading user is ('a' | 'b'), or null when there
    // is no reparto. Mirrors station_assignment.my_role for direct access.
    my_role: z.enum(['a', 'b']).nullable(),
    // #34 — the result(s) a CALIBRATION-test session must capture, derived from
    // coach_test_results via workout_assignments.calibration_test_id. Each entry
    // says what number to ask for + its unit (measure time→seconds, load→kg,
    // distance→meters, …). Empty [] for a normal (non-test) session. Defaulted so
    // older payloads (before #34) still parse.
    store_results: z.array(assignmentDetailStoreResultSchema).default([]),
  }),
  workout: assignmentDetailWorkoutSchema.nullable(),
});
export type AssignmentDetailResponse = z.infer<typeof assignmentDetailResponseSchema>;
