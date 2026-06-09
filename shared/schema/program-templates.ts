import { z } from 'zod';
import { atrBlockType, idSchema, isoDateTime, templateFormat } from './_primitives';
import { prescriptionSchema } from '../domain/prescription';

export const PROGRAM_LEVELS = ['beginner', 'intermediate', 'pro', 'elite'] as const;
export const programLevelSchema = z.enum(PROGRAM_LEVELS);
export type ProgramLevel = z.infer<typeof programLevelSchema>;

export const weekSlotKindSchema = z.enum(['rest', 'workout']);

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
  level: programLevelSchema,
  atr_block_hint: atrBlockType.nullable().optional(),
  slots_json: weekSlotsSchema,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type ProgramWeekTemplate = z.infer<typeof programWeekTemplateSchema>;

export const programWeekUpsertSchema = z.object({
  name: z.string().min(1).max(200),
  level: programLevelSchema,
  atr_block_hint: atrBlockType.nullable().optional(),
  focus: z.string().max(200).nullable().optional(),
  coach_notes: z.string().max(4000).nullable().optional(),
  slots_json: weekSlotsSchema,
});
export type ProgramWeekUpsert = z.infer<typeof programWeekUpsertSchema>;

export const programMonthUpsertSchema = z.object({
  name: z.string().min(1).max(200),
  level: programLevelSchema,
  atr_block_hint: atrBlockType.nullable().optional(),
  week_template_ids: z.array(idSchema).min(1).max(6),
});
export type ProgramMonthUpsert = z.infer<typeof programMonthUpsertSchema>;

export const programMacrocycleBlockInputSchema = z.object({
  type: atrBlockType,
  month_template_ids: z.array(idSchema).min(1).max(8),
});

export const programMacrocycleUpsertSchema = z.object({
  name: z.string().min(1).max(200),
  level: programLevelSchema,
  is_default: z.boolean().optional(),
  blocks: z.array(programMacrocycleBlockInputSchema).min(1).max(6),
});
export type ProgramMacrocycleUpsert = z.infer<typeof programMacrocycleUpsertSchema>;

/** Map legacy intake levels 1–3 to program levels; 3 → pro, add elite via tests later. */
export function programLevelFromAthleteLevel(level: 1 | 2 | 3): ProgramLevel {
  if (level === 1) return 'beginner';
  if (level === 2) return 'intermediate';
  return 'pro';
}
