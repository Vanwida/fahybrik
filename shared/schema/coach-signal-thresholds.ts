import { z } from 'zod';
import {
  COACH_SIGNAL_THRESHOLD_MAX_DAYS,
  COACH_SIGNAL_THRESHOLD_MIN_DAYS,
  type CoachSignalThresholds,
} from '../domain/coach/signal-thresholds';

// Contrato de cable de los umbrales de señal editables por el coach.
//   GET /api/coach/signal-thresholds  → CoachSignalThresholdsResponse
//   PUT /api/coach/signal-thresholds  ← coachSignalThresholdsPutSchema
// Una sola fuente para la ruta (validación en servidor) y para el editor del
// dashboard. snake_case en el cable. Espejo de shared/schema/coach-import-defaults.ts.

const daysSchema = z
  .number()
  .int()
  .min(COACH_SIGNAL_THRESHOLD_MIN_DAYS)
  .max(COACH_SIGNAL_THRESHOLD_MAX_DAYS);

/**
 * Cuerpo del PUT: el conjunto ENTERO. Como en `coach_guidance`, guardar
 * reemplaza la fila entera y no hay parche por campo, así que el editor y el
 * motor de señales nunca pueden discrepar sobre cuáles son «los del coach».
 */
export const coachSignalThresholdsPutSchema = z
  .object({
    communication_question_unanswered_days: daysSchema,
    communication_task_overdue_critical_days: daysSchema,
    communication_protocol_unopened_days: daysSchema,
  })
  .strict();

export type CoachSignalThresholdsPutInput = z.infer<typeof coachSignalThresholdsPutSchema>;

/** Respuesta del GET: los umbrales resueltos + si son suyos o los del sistema. */
export interface CoachSignalThresholdsResponse extends CoachSignalThresholds {
  /** true = fila escrita por el coach; false = se están sirviendo los del sistema. */
  is_custom: boolean;
  updated_at: string | null;
}
