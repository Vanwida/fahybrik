import { z } from 'zod';
import {
  apiIdSchema,
  assignDeliverySchema,
  assignOnConflictSchema,
  mondaySchema,
  ASSIGN_MAX_ATHLETES,
} from './assign-many';
import { sequenceEndPolicy, sequenceProgressionTarget } from './program-sequences';
import type { GroupAnchor } from '../domain/coach/plan-placement';

// GRUPOS (§4.5) — un conjunto de atletas con su plan: una cadena ordenada de
// programas. Por debajo es `program_sequences` (0059 + 0215): el nombre es del
// coach; nivel y días son opcionales y, si están los dos, forman la regla de
// pertenencia automática (la celda nivel × días de siempre).
//
// Miembros = atletas con `athlete_sequence_progress` activo en el grupo. Un atleta
// está como mucho en UN grupo: entrar en otro le saca del anterior.

export const GROUP_NAME_MAX = 80;

const groupName = z
  .string()
  .trim()
  .min(1, 'Ponle un nombre al grupo.')
  .max(GROUP_NAME_MAX, `El nombre no puede pasar de ${GROUP_NAME_MAX} caracteres.`);

const daysPerWeek = z
  .number()
  .int()
  .min(1, 'Los días por semana van de 1 a 7.')
  .max(7, 'Los días por semana van de 1 a 7.');

/** Un programa de la cadena. `item_id` conserva su identidad al reordenar (así
 *  el cursor de cada miembro sigue en el programa que está haciendo). */
export const groupProgramRefSchema = z.object({
  program_id: apiIdSchema,
  item_id: apiIdSchema.optional(),
});

const progressionPair = <T extends { progression_pct?: number | null | undefined; progression_applies_to?: string | null | undefined }>(v: T) =>
  (v.progression_pct === undefined) === (v.progression_applies_to === undefined) &&
  (v.progression_pct == null) === (v.progression_applies_to == null);

export const groupCreateSchema = z
  .object({
    name: groupName,
    level_id: apiIdSchema.nullable().optional(),
    days_per_week: daysPerWeek.nullable().optional(),
    end_policy: sequenceEndPolicy.default('repeat'),
    progression_pct: z.number().min(0).max(100).nullable().optional(),
    progression_applies_to: sequenceProgressionTarget.nullable().optional(),
    programs: z.array(groupProgramRefSchema).max(52).default([]),
  })
  .strict()
  .refine(progressionPair, {
    message: 'La progresión va en pareja: porcentaje y a qué se aplica, o ninguno de los dos.',
    path: ['progression_pct'],
  });
export type GroupCreateInput = z.infer<typeof groupCreateSchema>;

export const groupPatchSchema = z
  .object({
    name: groupName.optional(),
    level_id: apiIdSchema.nullable().optional(),
    days_per_week: daysPerWeek.nullable().optional(),
    end_policy: sequenceEndPolicy.optional(),
    progression_pct: z.number().min(0).max(100).nullable().optional(),
    progression_applies_to: sequenceProgressionTarget.nullable().optional(),
    programs: z.array(groupProgramRefSchema).max(52).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay nada que cambiar.' })
  .refine(progressionPair, {
    message: 'La progresión va en pareja: porcentaje y a qué se aplica, o ninguno de los dos.',
    path: ['progression_pct'],
  });
export type GroupPatchInput = z.infer<typeof groupPatchSchema>;

export const groupMembersSchema = z
  .object({
    athlete_ids: z.array(apiIdSchema).min(1, 'Elige al menos un atleta.').max(ASSIGN_MAX_ATHLETES),
    action: z.enum(['add', 'remove']),
    /** Solo al añadir. Por defecto: el lunes que viene, alineado con el grupo. */
    start_date: mondaySchema.optional(),
    /** Forzar desde qué programa (posición) y semana entra, en vez de alinear. */
    start_position: z.number().int().min(1).optional(),
    start_week: z.number().int().min(1).max(52).optional(),
    on_conflict: assignOnConflictSchema.default('chain'),
    delivery: assignDeliverySchema.default('auto'),
    dry_run: z.boolean().optional(),
  })
  .strict();
export type GroupMembersInput = z.infer<typeof groupMembersSchema>;

export interface GroupProgram {
  item_id: string;
  position: number;
  program_id: string;
  name: string;
  weeks: number;
  sessions: number;
}

export interface GroupSummary {
  id: string;
  /** Lo que escribió el coach; null si no le puso nombre. */
  name: string | null;
  /** Lo que se pinta: el nombre, o «Nivel N3 · 5 días». */
  display_name: string;
  /** `name` = el código corto del coach (N3); `label` = su nombre largo (Rendimiento). */
  level: { id: string; name: string; label: string } | null;
  days_per_week: number | null;
  /** ¿Tiene regla de pertenencia automática (nivel y días)? */
  auto_rule: boolean;
  end_policy: 'repeat' | 'level_up' | 'stop';
  progression_pct: number | null;
  progression_applies_to: 'strength_load' | 'volume' | 'pace' | null;
  member_count: number;
  programs: GroupProgram[];
  total_weeks: number;
  updated_at: string;
}

export interface GroupMember {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  level_label: string | null;
  lifecycle: 'activo' | 'pausado' | 'baja';
  /** Posición en la cadena (1-based). */
  position: number;
  program: { id: string; name: string; weeks: number } | null;
  /** Semana del programa en la que está hoy; null si aún no ha empezado o ya acabó. */
  week: number | null;
  program_start: string | null;
  program_end: string | null;
  /** Hasta cuándo tiene plan (el último día del último recibo). */
  plan_end: string | null;
  joined_at: string;
}

export interface GroupCalendarItem {
  position: number;
  program_id: string;
  name: string;
  start_date: string;
  end_date: string;
}

export interface GroupDetail extends GroupSummary {
  members: GroupMember[];
  /** Calendario del grupo (lo que dice la mayoría de sus miembros). */
  calendar: { anchor: GroupAnchor | null; items: GroupCalendarItem[] };
  /** Atletas que cumplen la regla (nivel y días) y aún no están: «Asignar a nuevos (n)». */
  rule_candidates: Array<{ athlete_id: string; name: string }>;
}

export interface GroupRemoveResult {
  removed: Array<{ athlete_id: string; plan_until: string | null }>;
  skipped: Array<{ athlete_id: string; reason: string }>;
}
