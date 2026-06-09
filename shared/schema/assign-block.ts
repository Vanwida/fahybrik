import { z } from 'zod';
import { idSchema, isoDate, atrBlockType } from './_primitives';

/**
 * Input para asignar/aprobar UN bloque ATR (microciclo en lenguaje de coach) a un
 * atleta. El bloque es la unidad de asignación: ACC (acumulación), TRANS
 * (transformación) o REAL (realización). Asignar un bloque materializa SUS
 * semanas (cada `program_week_template` → un microciclo + workout_assignments).
 *
 * Dos formas de identificar qué semanas materializar (exclusivas):
 *  - `atr_block`: el servidor resuelve las plantillas de semana con ese
 *    `atr_block_hint`, ordenadas, y rellena las N semanas del bloque planificado.
 *  - `program_week_template_ids`: el coach fija explícitamente las plantillas en
 *    orden de semana (override fino, p.ej. variante Resistencia/Fuerza por semana).
 *
 * `start_date` es opcional: por defecto el bloque arranca en su `start_date`
 * planificado en `atr_blocks`. Cuando se pasa, se alinea al lunes de esa semana.
 *
 * `force` re-materializa aunque el bloque ya tenga sesiones (idempotente por
 * defecto: si ya está asignado, no se duplica salvo `force`).
 */
export const assignBlockInputSchema = z
  .object({
    atr_block: atrBlockType.optional(),
    program_week_template_ids: z.array(idSchema).min(1).max(8).optional(),
    start_date: isoDate.optional(),
    force: z.boolean().optional().default(false),
  })
  .refine(
    (v) => Boolean(v.atr_block) !== Boolean(v.program_week_template_ids),
    {
      message:
        'Indica exactamente uno: atr_block (auto) o program_week_template_ids (explícito)',
      path: ['atr_block'],
    },
  );

export type AssignBlockInput = z.infer<typeof assignBlockInputSchema>;
