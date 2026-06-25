import { z } from 'zod';
import { slugSchema } from './_primitives';

// Blocks library (Biblioteca de Bloques) — Pablo's methodology as reusable
// training blocks. One row = one concrete prescription, stored VERBATIM in
// `description` (Model A: no fine parsing). Classified into one of the 10
// methodology_groups. See migration 0037_blocks_library.sql.

// Coarse format hints (inferred from group/text — NOT the technical
// templates.format enum). Open-ended string in DB; this is the known set.
export const blockFormat = z.enum([
  'strength_block',
  'plyometric',
  'erg_intervals',
  'run_intervals',
  'zone2',
  'metcon',
  'race_sim',
  'core_mobility',
  'functional_circuit',
  'tapering',
]);
export type BlockFormat = z.infer<typeof blockFormat>;

export const blockSchema = z.object({
  id: z.number().int().positive(),
  slug: slugSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  methodology_group_id: z.number().int().min(1).max(10),
  format: z.string().nullable(),
  source_ref: z.string().nullable(),
  // true when the verbatim couldn't be mapped to the catalog with confidence
  // (dense WODs / ambiguous formats). Such blocks keep only their verbatim and
  // are pending Pablo's structured review (migration 0038). The library surfaces
  // them as "sin desglosar — pendiente". Defaults false for older callers.
  needs_review: z.boolean().default(false),
});
export type Block = z.infer<typeof blockSchema>;

export const blockListSchema = z.array(blockSchema);

// Coach-editable fields of a library block (Biblioteca maestra global). Mutating
// these affects every FUTURE materialization of the block. The structured
// `block_exercises` are NOT edited here — that is a separate step. All fields
// optional so the coach can PATCH a single field; at least one is required.
export const blockUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(4000),
    methodology_group_id: z.number().int().min(1).max(10),
    // Level range + days/week tags (migration 0057). FK to athlete_levels; null = any.
    min_level_id: z.number().int().positive().nullable(),
    max_level_id: z.number().int().positive().nullable(),
    // Meaningful training days: 3–6 (less than 3 is not a block prescription).
    days_per_week: z.number().int().min(3).max(6).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Al menos un campo a actualizar',
  });
export type BlockUpdate = z.infer<typeof blockUpdateSchema>;
