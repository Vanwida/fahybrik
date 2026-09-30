import { z } from 'zod';
import { PLAN_RENEWAL_DAYS_MAX, PLAN_RENEWAL_DAYS_MIN } from '../domain/coach/plan-renewal';

// Ajuste del coach «renovar el plan N días antes de que acabe» (GET/PATCH
// /api/coach/plan-renewal). null = volver al defecto del producto.

export const planRenewalPatchSchema = z
  .object({
    plan_renewal_days_before: z
      .number()
      .int('Tiene que ser un número entero de días.')
      .min(PLAN_RENEWAL_DAYS_MIN, `Como mínimo ${PLAN_RENEWAL_DAYS_MIN} días.`)
      .max(PLAN_RENEWAL_DAYS_MAX, `Como máximo ${PLAN_RENEWAL_DAYS_MAX} días antes.`)
      .nullable(),
  })
  .strict();
export type PlanRenewalPatch = z.infer<typeof planRenewalPatchSchema>;

export interface PlanRenewalSetting {
  /** Lo guardado; null = usa el defecto. */
  plan_renewal_days_before: number | null;
  /** Lo que se aplica de verdad. */
  effective_days: number;
  default_days: number;
}
