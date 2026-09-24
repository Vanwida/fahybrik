import { z } from 'zod';
import {
  COACH_THRESHOLD_KEYS,
  COACH_THRESHOLD_SPEC,
  type CoachThresholdKey,
  type CoachThresholds,
} from '../domain/coach/signal-thresholds';

// Contrato de cable de los umbrales de señal (y bandas de readiness) del coach.
//   GET /api/coach/signal-thresholds  → CoachSignalThresholdsResponse
//   PUT /api/coach/signal-thresholds  ← coachSignalThresholdsPutSchema
// Una sola fuente para la ruta (validación en servidor) y para el editor del
// dashboard. snake_case en el cable. Límites: `COACH_THRESHOLD_SPEC`.

/** Un número entero dentro de los límites de su clave, o null = «vuelve al defecto». */
function keySchema(key: CoachThresholdKey) {
  const spec = COACH_THRESHOLD_SPEC[key];
  return z.number().int().min(spec.min).max(spec.max).nullable().optional();
}

/**
 * Cuerpo del PUT: SOLO las claves que se cambian. Cada una es su número nuevo o
 * `null` para volver al defecto del sistema; las que no vienen se quedan como
 * estaban. La pantalla de Método guarda al salir de cada campo, así que el cable
 * es por campo — y la coherencia entre campos (cautela < bien…) la comprueba el
 * servidor sobre los valores efectivos resultantes (`thresholdIssues`).
 */
export const coachSignalThresholdsPutSchema = z
  .object(
    Object.fromEntries(COACH_THRESHOLD_KEYS.map((k) => [k, keySchema(k)])) as Record<
      CoachThresholdKey,
      ReturnType<typeof keySchema>
    >,
  )
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Nada que guardar',
  });

export type CoachSignalThresholdsPutInput = z.infer<typeof coachSignalThresholdsPutSchema>;

/**
 * Respuesta del GET y del PUT: los umbrales EFECTIVOS en plano (una clave por
 * umbral), cuáles son del coach y cuáles del sistema, y los defectos para que la
 * pantalla pueda decir «defecto: 3».
 */
export interface CoachSignalThresholdsResponse extends CoachThresholds {
  /** true = el coach ha fijado al menos uno; false = todo son los del sistema. */
  is_custom: boolean;
  /** Las claves que ha fijado el coach (el resto sirve el defecto). */
  custom_keys: CoachThresholdKey[];
  /** Los defectos del sistema, para pintar «defecto» y «restaurar». */
  defaults: CoachThresholds;
  updated_at: string | null;
}
