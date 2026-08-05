import { z } from 'zod';
import { idSchema, isoDateTime, templateFormat } from './_primitives';
import { prescriptionSchema } from '../domain/prescription';

export const weekSlotKindSchema = z.enum(['rest', 'workout']);

/**
 * KIND de un DÍA de la semana (día TIPADO). Un día es `workout` (lleva ≥1 sesión
 * de entreno) o `rest` (DESCANSO deliberado: sin sesiones, pero INTENCIONAL —
 * distinto de un día vacío aún sin autorizar). Vive en `slots_json` → aditivo,
 * SIN migración.
 *
 * EXTENSIBLE por diseño: los tipos de día futuros (`test` de calibración,
 * `competition`) extenderán este enum. NO implementados aún — no añadir miembros
 * hasta construirlos (día tipado #47).
 */
export const weekDayKindSchema = z.enum(['workout', 'rest']);
export type WeekDayKind = z.infer<typeof weekDayKindSchema>;

/**
 * Actividad de RECUPERACIÓN — oferta blanda del coach para un día de DESCANSO.
 * NO es un entreno: no cuenta para adherencia, NO lleva intensidad/carga/RPE/
 * series (eso es una prescripción, aquí vetado). Es un HINT de qué hacer para
 * recuperar. Enum TIPADO (no texto libre) que cubre la categoría completa —
 * cardio suave, tejido blando, movilidad, respiración y termoterapia — con
 * `other` (+ `note`) para el long tail.
 *
 * DRY: verificado que NO existía catálogo reutilizable. El enum `modality` (mig
 * 0053: run/row/ski/bike/strength/functional/core/mobility/other) es la modalidad
 * de ENTRENO de un ejercicio — otro concepto — y no tiene los valores de
 * recuperación (walk, foam_roll, breathing, easy_swim, sauna…).
 */
export const recoveryActivitySchema = z.enum([
  'mobility', // movilidad
  'stretching', // estiramientos
  'yoga',
  'walk', // paseo / caminar
  'easy_run', // trote / rodaje muy suave (recuperación activa)
  'easy_ride', // bici suave
  'easy_swim', // nado suave
  'foam_roll', // foam roller / liberación miofascial
  'massage', // masaje / automasaje
  'breathing', // respiración / relajación
  'sauna', // sauna / calor
  'cold_therapy', // frío / baño de contraste / crioterapia
  'other', // otra recuperación (detalle en `note`)
]);
export type RecoveryActivity = z.infer<typeof recoveryActivitySchema>;

/**
 * Una sugerencia de recuperación: QUÉ actividad + (opcional) cuántos minutos +
 * (opcional) nota aclaratoria del coach ("cuádriceps e isquios", "ritmo cómodo").
 * Sin intensidad/carga/RPE — oferta blanda, NO prescripción. `duration_min` es un
 * hint, no un objetivo medido.
 */
export const recoverySuggestionSchema = z.object({
  activity: recoveryActivitySchema,
  duration_min: z.number().int().min(1).max(240).optional(),
  note: z.string().max(300).optional(),
});
export type RecoverySuggestion = z.infer<typeof recoverySuggestionSchema>;

export const weekDayBlockSectionSchema = z.enum([
  'warmup',
  'mobility',
  'strength',
  'accessory',
  'metcon',
  'emom',
  'cooldown',
]);
export type WeekDayBlockSection = z.infer<typeof weekDayBlockSectionSchema>;

/**
 * Grupo ESTRUCTURAL del bloque dentro de la sesión: calentamiento / principal /
 * vuelta a la calma. Es el eje que el coach organiza en el editor (las cabeceras
 * del rail). ORDEN de ejecución = calentamiento → principal → vuelta; el array de
 * bloques se guarda en ese orden y el atleta lo lee así.
 *
 * Aditivo y retro-compatible: los parts legacy no lo llevan y el loader lo DERIVA
 * del título/formato (inferGroup) al cargar. Cuando el coach lo fija en el editor,
 * se persiste aquí para que su colocación (p. ej. una vuelta a la calma) sea
 * DURABLE y no dependa de que el título "suene" a calentamiento/vuelta.
 */
export const structureGroupSchema = z.enum(['calentamiento', 'principal', 'vuelta']);
export type StructureGroup = z.infer<typeof structureGroupSchema>;

/**
 * Configuración de timing/formato a nivel BLOQUE (AMRAP, EMOM, circuito…) y los
 * parámetros del bloque según su grupo metodológico de Pablo (Running, Zona 2,
 * Ergómetros, Fuerza…). Todos opcionales: cada tipo de bloque rellena los suyos.
 * Aditivo y retro-compatible: los parts existentes solo usan el primer bloque de
 * campos; los nuevos campos (distancia/ritmo/zona/series) los consume el editor
 * de params por grupo metodológico. El materializador ignora este config.
 */
export const weekDayPartConfigSchema = z.object({
  // Timing / estructura WOD-Metcon y circuitos.
  time_cap_seconds: z.number().int().positive().optional(),
  emom_interval_seconds: z.number().int().positive().optional(),
  rounds: z.number().int().positive().optional(),
  work_seconds: z.number().int().positive().optional(),
  rest_seconds: z.number().int().nonnegative().optional(),
  stations: z.number().int().positive().optional(),
  // Cardio estructurado — Running (grupo 4), Ergómetros (grupo 3), Zona 2 (grupo 5).
  duration_seconds: z.number().int().positive().optional(),
  distance_meters: z.number().int().positive().optional(),
  pace_sec_per_km: z.number().int().positive().optional(),
  hr_zone: z.number().int().min(1).max(5).optional(),
  // Fuerza (grupo 1) / Pliometría (grupo 2) / Tapering (grupo 10) a nivel bloque.
  sets: z.number().int().positive().optional(),
  reps: z.number().int().positive().optional(),
  load_pct: z.number().int().min(0).max(100).optional(),
  load_kg: z.number().nonnegative().optional(),
  rpe: z.number().int().min(1).max(10).optional(),
});
export type WeekDayPartConfig = z.infer<typeof weekDayPartConfigSchema>;

/** Ejercicio dentro de un bloque del día. */
export const weekDayPartItemSchema = z.object({
  uid: z.string().min(1).max(64),
  exercise_id: idSchema,
  exercise_name: z.string().min(1).max(200),
  params_json: z.record(z.unknown()).optional(),
  // Prescripción STRUCTURADA por-set (migración 0043). El editor del studio edita
  // este shape; `params_json` se mantiene en paralelo como resumen escalar para
  // back-compat (resumen de fila, materializador, iOS) mientras dura la
  // transición. Opcional y aditivo: las semanas antiguas no lo llevan y el
  // editor lo DERIVA on-the-fly desde params_json+notes (legacyItemToPrescription)
  // sin mutar el almacenamiento.
  prescription_json: prescriptionSchema.optional(),
  notes: z.string().max(500).optional(),
});
export type WeekDayPartItem = z.infer<typeof weekDayPartItemSchema>;

/**
 * Modificadores ajustables por uso de un bloque insertado desde la Biblioteca
 * de Bloques (0037). Editables sin mutar el bloque de origen. Todos opcionales.
 */
export const blockUseModifiersSchema = z.object({
  intensity_pct: z.number().int().min(0).max(200).optional(),
  level: z.string().max(40).optional(),
  duration_min: z.number().int().positive().max(600).optional(),
  rounds: z.number().int().positive().max(60).optional(),
});
export type BlockUseModifiers = z.infer<typeof blockUseModifiersSchema>;

/** Bloque contenedor (calentamiento, AMRAP, circuito…) con ejercicios dentro. */
export const weekDayPartSchema = z.object({
  uid: z.string().min(1).max(64),
  format: templateFormat,
  title: z.string().min(1).max(120),
  // Grupo metodológico de Pablo (1–10, tabla methodology_groups). Clasifica el
  // bloque a medida igual que los 97 de la Biblioteca, para que biblioteca/IA lo
  // entiendan. Opcional y aditivo: los parts de biblioteca lo derivan del bloque
  // origen y los legacy no lo llevan. El materializador no lo lee.
  methodology_group_id: z.number().int().min(1).max(10).optional(),
  // Grupo estructural (calentamiento/principal/vuelta). Opcional y aditivo: los
  // parts legacy no lo llevan y el loader lo deriva del título/formato. El coach
  // lo fija desde el editor de día y aquí se persiste (colocación durable). El
  // materializador y el atleta lo ignoran — solo consumen el ORDEN del array.
  group: structureGroupSchema.optional(),
  config_json: weekDayPartConfigSchema.optional(),
  coach_note: z.string().max(2000).optional(),
  items: z.array(weekDayPartItemSchema).max(24).default([]),
  // Procedencia opcional: cuando el bloque se insertó desde la Biblioteca de
  // Bloques (0037). `source_block_id` referencia `blocks.id`; `block_modifiers`
  // son ajustes por uso (no mutan la biblioteca). Aditivo y retro-compatible:
  // los parts existentes (sin estos campos) y el materializador no se ven
  // afectados — el materializador ignora ambos.
  source_block_id: z.number().int().positive().optional(),
  block_modifiers: blockUseModifiersSchema.optional(),
  // Nota POR-ATLETA de este uso del bloque (Fase 3). Separada de `coach_note`
  // para no colisionar con la prescripción verbatim de la biblioteca, que vive
  // en `coach_note` para los bloques de biblioteca. Aditivo y opcional: el
  // materializador y el PUT de program-weeks la ignoran.
  athlete_note: z.string().max(800).optional(),
});
export type WeekDayPart = z.infer<typeof weekDayPartSchema>;

/** @deprecated Legacy — ejercicio plano sin contenedor. Migrar a parts. */
export const weekDayBlockSchema = z.object({
  uid: z.string().min(1).max(64),
  exercise_id: idSchema,
  exercise_name: z.string().min(1).max(200),
  section: weekDayBlockSectionSchema.default('strength'),
  params_json: z.record(z.unknown()).optional(),
  notes: z.string().max(500).optional(),
});
export type WeekDayBlock = z.infer<typeof weekDayBlockSchema>;

/**
 * @deprecated Legacy slot shape (am/pm). Kept exported solo para tipar el
 * helper de normalización de payloads antiguos. Nuevo código usa `weekSessionSchema`.
 */
export const weekDaySlotSchema = z.object({
  kind: weekSlotKindSchema,
  template_id: idSchema.nullable().optional(),
});

/**
 * Una sesión = un workout (típicamente AM o PM, pero el modelo soporta N por día).
 * Dentro de la sesión hay bloques (calentamiento, movilidad, fuerza, WOD…).
 */
export const weekSessionSchema = z.object({
  kind: weekSlotKindSchema,
  template_id: idSchema.nullable().optional(),
  /** Bloques dentro de la sesión (lo que antes era `parts` / `pm_parts`). */
  blocks: z.array(weekDayPartSchema).max(16).optional(),
  focus: z.string().max(120).optional(),
  notes: z.string().max(800).optional(),
});
export type WeekSession = z.infer<typeof weekSessionSchema>;

export const weekDaySchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  /**
   * Tipo del día (workout | rest). OPCIONAL y aditivo: los días legacy no lo
   * llevan y su tipo se DERIVA de la presencia de sesiones de entreno. Cuando el
   * coach marca un día como DESCANSO deliberado, se persiste 'rest' aquí (con
   * `sessions: []`), lo que distingue un descanso INTENCIONAL de un día vacío sin
   * autorizar. El materializador no crea asignación para un día sin sesiones de
   * entreno; el remap por disponibilidad reordena los días de entreno por atleta,
   * así que este 'rest' es una señal de AUTORÍA del coach (canonical Mon-Sun),
   * no el descanso final del atleta (ése sale de SU disponibilidad).
   */
  kind: weekDayKindSchema.optional(),
  /**
   * Sugerencias de RECUPERACIÓN (oferta blanda del coach) para un día de DESCANSO.
   * Solo tiene sentido cuando el día es kind='rest': el write-path (serializeDay)
   * las descarta en días de entreno y el read-path del atleta solo las expone en
   * días de descanso. Opcional y aditivo (sin migración). NO es un entreno — no
   * cuenta adherencia, sin intensidad/carga.
   */
  recovery_suggestions: z.array(recoverySuggestionSchema).max(8).optional(),
  /** 0 = rest day. 1-N entrenos. Típico: 1-2. */
  sessions: z.array(weekSessionSchema).max(6),
  /** Foco a nivel día (una sesión puede tener focus propio adicional). */
  focus: z.string().max(120).optional(),
  notes: z.string().max(800).optional(),
});

export const weekSlotsSchema = z.object({
  days: z.array(weekDaySchema).max(7),
});
export type WeekSlots = z.infer<typeof weekSlotsSchema>;
export type WeekDay = WeekSlots['days'][0];

/**
 * Adapter compat: acepta input legacy (`{ am, pm, parts, pm_parts, coach_note, blocks, pm_blocks }`)
 * o nuevo (`{ sessions }`) y devuelve siempre el shape nuevo.
 *
 * Reglas legacy → sessions[]:
 * - `am.kind === 'workout'` → `sessions[0] = { kind, template_id, blocks: parts }`
 * - `pm.kind === 'workout'` → `sessions[N] = { kind, template_id, blocks: pm_parts }`
 * - ambos rest → `sessions: []`
 * - `coach_note` → `notes`
 *
 * Legacy `blocks`/`pm_blocks` (deprecated ya en el modelo viejo) se descartan;
 * en producción su contenido vive en `parts`/`pm_parts`.
 */
export function normalizeWeekDay(input: unknown): z.infer<typeof weekDaySchema> {
  const raw = (input ?? {}) as Record<string, unknown>;

  // Already new shape — pass through.
  if (Array.isArray(raw.sessions)) {
    return {
      day_of_week: Number(raw.day_of_week ?? 1),
      // Carry the day KIND through (aditivo): a 'rest' day must survive the
      // round-trip, else the deliberate-rest signal is lost on every load/save.
      kind: raw.kind === 'rest' || raw.kind === 'workout' ? (raw.kind as WeekDayKind) : undefined,
      // Carry recovery suggestions through (aditivo, solo días de descanso).
      recovery_suggestions: Array.isArray(raw.recovery_suggestions)
        ? (raw.recovery_suggestions as z.infer<typeof recoverySuggestionSchema>[])
        : undefined,
      sessions: raw.sessions as z.infer<typeof weekSessionSchema>[],
      focus: (raw.focus as string | undefined) ?? undefined,
      notes:
        (raw.notes as string | undefined) ??
        (raw.coach_note as string | undefined) ??
        undefined,
    };
  }

  // Legacy am/pm shape — fold into sessions[].
  const am = (raw.am ?? null) as { kind?: string; template_id?: unknown } | null;
  const pm = (raw.pm ?? null) as { kind?: string; template_id?: unknown } | null;
  const parts = Array.isArray(raw.parts)
    ? (raw.parts as z.infer<typeof weekDayPartSchema>[])
    : undefined;
  const pmParts = Array.isArray(raw.pm_parts)
    ? (raw.pm_parts as z.infer<typeof weekDayPartSchema>[])
    : undefined;

  const sessions: z.infer<typeof weekSessionSchema>[] = [];
  if (am?.kind === 'workout') {
    sessions.push({
      kind: 'workout',
      template_id: (am.template_id as number | bigint | null | undefined) ?? null,
      ...(parts && parts.length > 0 ? { blocks: parts } : {}),
    });
  } else if (parts && parts.length > 0) {
    // Legacy edge: parts presentes sin marker AM → respetamos como sesión.
    sessions.push({ kind: 'workout', blocks: parts });
  }

  if (pm?.kind === 'workout') {
    sessions.push({
      kind: 'workout',
      template_id: (pm.template_id as number | bigint | null | undefined) ?? null,
      ...(pmParts && pmParts.length > 0 ? { blocks: pmParts } : {}),
    });
  } else if (pmParts && pmParts.length > 0) {
    sessions.push({ kind: 'workout', blocks: pmParts });
  }

  return {
    day_of_week: Number(raw.day_of_week ?? 1),
    sessions,
    focus: (raw.focus as string | undefined) ?? undefined,
    notes:
      (raw.notes as string | undefined) ??
      (raw.coach_note as string | undefined) ??
      undefined,
  };
}

/**
 * Normaliza `slots_json` (legacy o nuevo) al shape nuevo, antes de pasarlo a Zod.
 */
export function normalizeWeekSlotsInput(input: unknown): z.infer<typeof weekSlotsSchema> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const days = Array.isArray(raw.days) ? raw.days : [];
  return { days: days.map(normalizeWeekDay) };
}

export const programWeekTemplateSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  name: z.string().min(1).max(200),
  slots_json: weekSlotsSchema,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type ProgramWeekTemplate = z.infer<typeof programWeekTemplateSchema>;

// ── Day editor save (v2 studio) ──────────────────────────────────────────────
// The v2 day editor edits ONE day of a week's slots_json and saves just that day.
// This is the validated wire shape the editor POSTs (the inverse of the editor
// loaders): a day_of_week + its sessions, each with blocks of exercise items
// carrying the structured Prescription. The server merges it into the week's
// other days (preserving them) before upserting the full week. `slot` is NOT sent
// — it is positional (derived from array order), so it round-trips losslessly.
export const editorItemInputSchema = z.object({
  uid: z.string().min(1).max(64),
  // null = an incomplete authoring line. The client Save gate blocks save while
  // any line is null; if one reaches the server (stale client / direct call) the
  // serializer THROWS InvalidAuthoringLineError → 400 (never silently dropped — A3).
  exercise_id: idSchema.nullable(),
  exercise_name: z.string().max(200).default(''),
  prescription: prescriptionSchema,
  notes: z.string().max(500).optional(),
});
export type EditorItemInput = z.infer<typeof editorItemInputSchema>;

export const editorBlockInputSchema = z.object({
  uid: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  format: templateFormat.nullable().optional(),
  methodology_group_id: z.number().int().min(1).max(10).nullable().optional(),
  // Grupo estructural elegido por el coach (calentamiento/principal/vuelta). El
  // serializer lo persiste en slots_json; opcional para callers que no lo envían.
  group: structureGroupSchema.optional(),
  source_block_id: z.number().int().positive().nullable().optional(),
  // Texto verbatim que no encaja en la estructura (misma semántica que
  // WeekDayPart.coach_note arriba — la prescripción/nota en prosa de un
  // bloque). Opcional: los callers que no lo envían (el editor de día hoy no
  // tiene UI para tocarlo) preservan el original vía el serializer, nunca lo
  // borran por omisión.
  coach_note: z.string().max(2000).optional(),
  items: z.array(editorItemInputSchema).max(24).default([]),
});
export type EditorBlockInput = z.infer<typeof editorBlockInputSchema>;

export const editorSessionInputSchema = z.object({
  uid: z.string().min(1).max(64),
  slot: z.enum(['am', 'pm', 'extra']),
  // Workout title (`WeekSession.focus`): a short coach- AND athlete-facing name
  // for the session ("Entreno de pierna", "Series"). Optional/agnostic; empty or
  // absent leaves the session untitled (athlete falls back to template name).
  focus: z.string().max(120).optional(),
  blocks: z.array(editorBlockInputSchema).max(16).default([]),
});
export type EditorSessionInput = z.infer<typeof editorSessionInputSchema>;

export const dayEditorSaveSchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  // Tipo del día. 'rest' = el coach marcó DESCANSO deliberado (se persiste con
  // `sessions` vacías, distinto de un día vacío); ausente/'workout' = día de
  // entreno (el kind se deriva de las sesiones). Opcional y aditivo para clientes
  // (importador, copia de día) que aún no lo envían.
  kind: weekDayKindSchema.optional(),
  // Sugerencias de recuperación (oferta blanda) del coach para un día de DESCANSO.
  // Validadas server-side; solo se persisten si el día es kind='rest' (serializeDay
  // las descarta en días de entreno). Opcional/aditivo. Enviar `[]` las limpia.
  recovery_suggestions: z.array(recoverySuggestionSchema).max(8).optional(),
  sessions: z.array(editorSessionInputSchema).max(6),
});
export type DayEditorSave = z.infer<typeof dayEditorSaveSchema>;

// ── Copiar día(s) → otra semana / otro día (v2 day editor) ───────────────────
// The coach copies the day they're editing into one or more TARGET days, in the
// SAME week or in ANOTHER week of the microciclo (cross-week). CLONE semantics
// (no progression bump — that is methodology, not tech): the source day's LIVE
// sessions (exactly what the coach sees, incl. unsaved edits) are sent and
// written into each `to_days` entry of the target week, fully replacing it.
// `to_week_id` omitted = same week as the source. `overwrite` must be true to
// replace a target day that already holds content (the client confirms first).
// Block/item uids are regenerated server-side so a clone never collides with the
// source inside one week's slots_json.
export const dayCopySchema = z
  .object({
    from_day_of_week: z.number().int().min(1).max(7),
    /** Omitted = copy within the SAME week as the source. */
    to_week_id: idSchema.optional(),
    /** One or more target days (1..7) to overwrite with the cloned source day. */
    to_days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    sessions: z.array(editorSessionInputSchema).max(6),
    overwrite: z.boolean().default(false),
  })
  // When staying in the SAME week (no to_week_id), a day can't be copied onto
  // itself. The cross-week / explicit-same-id case is enforced server-side, which
  // is the only place the source week id is known.
  .refine((v) => v.to_week_id !== undefined || !v.to_days.includes(v.from_day_of_week), {
    message: 'No se puede copiar un día sobre sí mismo',
  });
export type DayCopy = z.infer<typeof dayCopySchema>;

// ── Copiar el CONTENIDO de una semana → otra(s) semana(s) ────────────────────
// The key cross-week op: the coach builds one week and stamps its content onto
// other weeks ALREADY in the microciclo. OVERWRITES each target week's slots_json
// with a deep clone of the source (days/sessions/blocks/items + prescriptions,
// exercise_id preserved, NO dates, NO progression). Targets keep their own
// identity (name/level/focus) — only the CONTENT is replaced. `overwrite` must be
// true to replace a target that already holds content (the client confirms first).
export const weekContentCopySchema = z.object({
  /** Target weeks (program_week_templates.id) to receive the cloned content. */
  target_week_ids: z.array(idSchema).min(1).max(12),
  overwrite: z.boolean().default(false),
});
export type WeekContentCopy = z.infer<typeof weekContentCopySchema>;

export const programWeekUpsertSchema = z.object({
  name: z.string().min(1).max(200),
  focus: z.string().max(200).nullable().optional(),
  coach_notes: z.string().max(4000).nullable().optional(),
  slots_json: weekSlotsSchema,
});
export type ProgramWeekUpsert = z.infer<typeof programWeekUpsertSchema>;

// Metadata-only patch of a week template: the coach sets the athlete-facing
// "Foco de la semana" (the week's focus line) WITHOUT round-tripping the whole
// slots_json. `focus` doubles as the week's label in the editor and is the line
// surfaced to the athlete on the Plan week view. Empty string → cleared (null).
export const programWeekMetaSchema = z.object({
  focus: z
    .string()
    .max(200)
    .nullable()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : null;
    }),
});
export type ProgramWeekMeta = z.infer<typeof programWeekMetaSchema>;

export const programMonthUpsertSchema = z.object({
  name: z.string().min(1).max(200),
  week_template_ids: z.array(idSchema).min(1).max(6),
});
export type ProgramMonthUpsert = z.infer<typeof programMonthUpsertSchema>;
