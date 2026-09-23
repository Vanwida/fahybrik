// @fahybrid/shared/domain/coach/level-editor — lo que acepta el editor de
// niveles (Ajustes › Método): crear, renombrar, retirar, ordenar y los cortes de
// cada nivel. Zod compartido por las rutas y el cliente.

import { z } from 'zod';
import { LEVEL_METRICS, LEVEL_METRIC_SPEC } from './level-criteria';

export const LEVEL_NAME_MAX = 32;
export const LEVEL_LABEL_MAX = 64;
export const LEVEL_DESCRIPTION_MAX = 512;

const name = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Ponle un nombre.').max(LEVEL_NAME_MAX, `Como mucho ${LEVEL_NAME_MAX} caracteres.`));

export const levelCreateSchema = z
  .object({
    name,
    label: z.string().max(LEVEL_LABEL_MAX).nullable().optional(),
    description: z.string().max(LEVEL_DESCRIPTION_MAX).nullable().optional(),
  })
  .strict();

export const levelPatchSchema = z
  .object({
    name: name.optional(),
    label: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, 'La descripción corta no puede quedar vacía.').max(LEVEL_LABEL_MAX))
      .optional(),
    description: z.string().max(LEVEL_DESCRIPTION_MAX).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'No hay nada que cambiar.' });

export const levelReorderSchema = z
  .object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(50) })
  .strict();

const criterionSchema = z
  .object({
    metric: z.enum(LEVEL_METRICS),
    sex: z.enum(['male', 'female']).nullable(),
    threshold: z.number().positive(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const spec = LEVEL_METRIC_SPEC[c.metric];
    if (c.threshold < spec.min || c.threshold > spec.max) {
      ctx.addIssue({ code: 'custom', message: `${spec.label}: fuera de rango.`, path: ['threshold'] });
    }
    if (spec.by_sex !== (c.sex != null)) {
      ctx.addIssue({ code: 'custom', message: `${spec.label}: ${spec.by_sex ? 'va por sexo' : 'no va por sexo'}.`, path: ['sex'] });
    }
  });

/** `criteria: null` = volver al defecto del producto; `[]` = este nivel no se abre por marcas. */
export const levelCriteriaSchema = z
  .object({ criteria: z.array(criterionSchema).max(LEVEL_METRICS.length * 2).nullable() })
  .strict()
  .superRefine((b, ctx) => {
    const seen = new Set<string>();
    for (const c of b.criteria ?? []) {
      const key = `${c.metric}:${c.sex ?? '-'}`;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', message: 'Hay una marca repetida.' });
      seen.add(key);
    }
  });
