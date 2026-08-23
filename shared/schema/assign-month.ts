import { z } from 'zod';
import { idSchema, isoDate } from './_primitives';

export const assignMonthInputSchema = z.object({
  month_template_id: idSchema,
  start_date: isoDate,
  /** Semana del plan (1-based) en la que entra el atleta. Omitido/1 = desde el
   *  principio. Permite enganchar a un atleta a mitad de un mesociclo ya en
   *  marcha en vez de forzarlo a empezar siempre en semana 1. Validado contra
   *  el nº de semanas de la plantilla en `instantiateMonthFromTemplate`. */
  start_week_number: z.coerce.number().int().positive().optional(),
});

export type AssignMonthInput = z.infer<typeof assignMonthInputSchema>;
