// Contratos de las rutas de Programar (Zod en cliente y servidor, snake_case).

import { z } from 'zod';
import {
  DELOAD_VOLUME_MAX,
  DELOAD_VOLUME_MIN,
  PROGRESSION_LOAD_STEP_MAX,
  PROGRESSION_SETS_STEP_MAX,
} from '@fahybrid/shared/domain/coach/progression-steps';

const id = z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).transform((v) => String(v));
const tag = z.string().trim().min(1).max(40);

/** Un lote de celdas de la rejilla (el día se valida en el servidor con weekDaySchema). */
export const cellsWriteSchema = z.object({
  cells: z
    .array(z.object({ week_id: id, day_of_week: z.number().int().min(1).max(7), day: z.unknown() }))
    .min(1)
    .max(26 * 7),
});

export const programPatchSchema = z
  .object({
    name: z.string().trim().min(1, 'Ponle un nombre.').max(200).optional(),
    level_id: id.nullable().optional(),
    tags: z.array(tag).max(20).optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay nada que cambiar.' });

export const resolveTokensSchema = z.object({
  tokens: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
});

export const learnSynonymSchema = z.object({
  term: z.string().trim().min(1).max(120),
  exercise_id: id,
});

export const progressionStepsPatchSchema = z
  .object({
    load_step_pct: z.number().positive().max(PROGRESSION_LOAD_STEP_MAX).nullable().optional(),
    sets_step: z.number().int().min(1).max(PROGRESSION_SETS_STEP_MAX).nullable().optional(),
    deload_volume_pct: z.number().int().min(DELOAD_VOLUME_MIN).max(DELOAD_VOLUME_MAX).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay nada que cambiar.' });

export const libraryKindSchema = z.enum(['entreno', 'bloque']);

export const libraryBulkSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(['archive', 'unarchive']),
    items: z.array(z.object({ kind: libraryKindSchema, id: z.coerce.number().int().positive() })).min(1).max(500),
  }),
  z.object({
    action: z.literal('tag'),
    items: z.array(z.object({ kind: libraryKindSchema, id: z.coerce.number().int().positive() })).min(1).max(500),
    add: z.array(tag).max(20).default([]),
    remove: z.array(tag).max(20).default([]),
  }),
]);
