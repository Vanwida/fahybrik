import { z } from 'zod';
import { slugSchema } from './_primitives';

// The 10 pedagogical training groups from the master doc §10 "Biblioteca de
// Entrenamientos" (A8 / D3). Closed set with fixed ids 1..10 — see migration
// 0027_methodology_groups.sql. Used by the coach catalog filter + template
// editor selector.

export const methodologyGroupSchema = z.object({
  id: z.number().int().min(1).max(10),
  slug: slugSchema,
  name_es: z.string().min(1),
  name_en: z.string().min(1),
  description_es: z.string().nullable(),
  sort_order: z.number().int().nonnegative(),
});
export type MethodologyGroup = z.infer<typeof methodologyGroupSchema>;

export const methodologyGroupListSchema = z.array(methodologyGroupSchema);
