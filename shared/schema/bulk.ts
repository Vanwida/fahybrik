import { z } from 'zod';
import {
  apiIdSchema,
  assignDeliverySchema,
  assignOnConflictSchema,
  mondaySchema,
  ASSIGN_MAX_ATHLETES,
  type AssignResponse,
} from './assign-many';
import { PAUSE_REASONS } from '../domain/coach/athlete-lifecycle';
import type { GroupRemoveResult } from './groups';

// ACCIONES EN BLOQUE sobre atletas (§4.8): POST /api/coach/athletes/bulk.
// Todas reusan el servicio de UN atleta (nivel, pausa/reanudar, grupos). Todos los
// atletas tienen que ser del coach: si uno no lo es, no se toca NINGUNO.

const athleteIds = z
  .array(apiIdSchema)
  .min(1, 'Elige al menos un atleta.')
  .max(ASSIGN_MAX_ATHLETES, `Como mucho ${ASSIGN_MAX_ATHLETES} atletas por vez.`);

export const bulkAthletesSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set_level'), athlete_ids: athleteIds, level_id: apiIdSchema }).strict(),
  z
    .object({
      action: z.literal('pause'),
      athlete_ids: athleteIds,
      reason: z.enum(PAUSE_REASONS, {
        errorMap: () => ({ message: 'Para pausar hace falta el motivo: lesion, vacaciones, paron u otro.' }),
      }),
      note: z.string().trim().max(1000).optional(),
      end_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de vuelta va como AAAA-MM-DD.')
        .optional(),
    })
    .strict(),
  z.object({ action: z.literal('resume'), athlete_ids: athleteIds }).strict(),
  z
    .object({
      action: z.literal('add_to_group'),
      athlete_ids: athleteIds,
      group_id: apiIdSchema,
      start_date: mondaySchema.optional(),
      on_conflict: assignOnConflictSchema.default('chain'),
      delivery: assignDeliverySchema.default('auto'),
      dry_run: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('remove_from_group'),
      athlete_ids: athleteIds,
      /** Sin grupo: le saca del grupo en el que esté. */
      group_id: apiIdSchema.optional(),
    })
    .strict(),
]);
export type BulkAthletesInput = z.infer<typeof bulkAthletesSchema>;
export type BulkAction = BulkAthletesInput['action'];

export interface BulkAthleteResult {
  athlete_id: string;
  ok: boolean;
  /** Código estable cuando no se hizo (ya pausado, no está en el grupo…). */
  code: string | null;
  message: string | null;
}

export interface BulkAthletesResponse {
  action: BulkAction;
  changed: number;
  skipped: number;
  results: BulkAthleteResult[];
  /** add_to_group: el lote (vista previa + deshacer), igual que «Asignar». */
  assign?: AssignResponse;
  /** remove_from_group: hasta cuándo conserva cada uno su plan. */
  group_removal?: GroupRemoveResult;
}
