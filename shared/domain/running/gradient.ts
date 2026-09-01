// LA PENDIENTE DE UN TRAMO — «¿tiene sentido juzgar el ritmo aquí, o hay que
// pasar a tiempo?» (#71, mockup carrera-en-el-panel.html §07/§08: pendiente
// ≥3% retira el veredicto de ritmo — un ritmo bruto al 8% no significa nada).
//
// Hasta ahora la única señal era `SegmentActual.incline_pct` — la
// inclinación DECLARADA POR LA CINTA. En calle es siempre null, así que la
// regla firmada nunca se disparaba para el caso que más importa: un «8×200
// en cuesta al 8%» corrido al aire libre recibía veredicto de ritmo como si
// fuera llano. team-lead/Alex, 12-ago: no se resuelve en el cliente (sería
// un segundo motor sobre la misma señal de altitud, el mismo pecado que se
// acaba de evitar con el veredicto de cumplimiento) — se resuelve aquí, una
// vez, con la traza delante.
//
// LA REGLA, en dos decisiones ya tomadas:
//
//   1. CAMBIO NETO de altitud sobre la distancia del tramo, NUNCA desnivel
//      ACUMULADO. El acumulado (`elevation.ts`, con histéresis) suma subidas
//      y bajadas — útil para "¿cuánto desnivel hizo la sesión?", pero aquí
//      la pregunta es otra: un tramo llano con ruido de GPS daría pendiente
//      donde no la hay, y un ondulado con neto cero tiene pendiente media
//      CERO — correcto, porque ahí el ritmo SÍ significa algo (sube y baja
//      se compensan). `elevation.ts` y este módulo responden preguntas
//      distintas a propósito; no comparten fórmula.
//   2. LA CINTA MANDA cuando la hay: `incline_pct` es una medida DIRECTA del
//      aparato. La derivada de altitud es el respaldo para cuando no hay
//      máquina que lo diga — nunca al revés.
//
// SIN COBERTURA, NULL — nunca cero. Cero es "llano medido"; null es "no se
// sabe", y quien decide si retira el veredicto de ritmo tiene que poder
// distinguirlos (ver la recomendación en el informe de la tarea: null se
// trata como si la pendiente SÍ importara — el mismo criterio que "sin
// banda → sin_dato" en todo este bloque de trabajo, nunca "sin dato, así
// que asumo llano").
//
// La interpolación (serie ordenada + valor-en-instante, con el mismo criterio
// de hueco máximo) vive ahora en `timed-series.ts` — compartida con
// `route-zones.ts`, que necesita la misma pregunta para la velocidad. Ver la
// cabecera de ese fichero para el porqué de la extracción y lo que se dejó
// sin tocar a propósito.

import { toSortedPoints, valueAtTime } from './timed-series';

/**
 * LA PENDIENTE QUE RETIRA EL VEREDICTO DE RITMO — el DEFECTO, en por ciento.
 *
 * Esta cabecera lleva desde el principio enunciando la regla («≥3% retira el
 * veredicto de ritmo») sin aplicarla en ninguna parte: el número vivía SOLO en
 * Swift (`ReglasDeLectura.pendienteQueRetiraElRitmoPct`) y el servidor no lo
 * tenía. Dos constantes en dos superficies que hoy coinciden por casualidad y
 * mañana no.
 *
 * LA SOLUCIÓN NO ES CLAVARLO EN LOS DOS SITIOS, ES QUE HAYA UNO SOLO. Es
 * MÉTODO del coach —«¿otro entrenador competente lo haría distinto?» da que sí:
 * quien entrena trail no retira el ritmo al 3 %— así que nace como dato
 * (`coach_running_thresholds.gradient_retires_pace_pct`) con este valor por
 * defecto, y el servidor se lo MANDA al cliente en `run_compliance`. El cliente
 * deja de tener número propio: compara contra el que le llega.
 *
 * EL REPARTO, y es deliberado (team-lead, 12-ago):
 *   · este fichero es dueño del NÚMERO y de comparar UN valor contra él;
 *   · la PRECEDENCIA de tres ramas (lo prescrito / lo que declaró la cinta / lo
 *     medido) NO vive aquí. Vive una sola vez, en el cliente, porque además de
 *     retirar el veredicto cambia el eje del troceado a tiempo y cambia el
 *     sujeto de la lectura, y eso es presentación. Duplicarla aquí es
 *     exactamente lo que este movimiento existe para evitar.
 *
 * EN VALOR ABSOLUTO: una bajada del 6 % infla el ritmo tanto como una subida lo
 * hunde. Las dos lo dejan de significar.
 */
export const GRADIENT_RETIRES_PACE_PCT = 3;

/**
 * ¿Se SABE que este tramo iba en cuesta? Para promediar muchos tramos.
 *
 * `null` (no se sabe) responde FALSE a propósito, y la asimetría es la lectura
 * entera: la inmensa mayoría de las carreras en calle no tienen traza de
 * altitud, así que exigir pendiente conocida dejaría cualquier media vacía para
 * casi todo el mundo — peor que el sesgo que intenta evitar. Un terreno
 * desconocido es RUIDO, y el ruido se promedia; una cuesta del 8 % conocida es
 * un SESGO, y el sesgo se quita.
 *
 * OJO: esto NO sirve para juzgar UNA repetición. Ahí «no se sabe» tiene que
 * retirar el veredicto, no dejarlo pasar — y esa decisión, con sus tres ramas,
 * es del cliente (ver el reparto arriba). No añadas aquí el predicado contrario
 * «por simetría»: lo hubo, no lo usaba nadie, y era una invitación a que la
 * precedencia acabara viviendo en dos sitios.
 */
export function gradientKnownSteep(gradient_pct: number | null, threshold_pct: number): boolean {
  if (gradient_pct == null || !Number.isFinite(gradient_pct)) return false;
  if (!Number.isFinite(threshold_pct) || threshold_pct <= 0) return false;
  return Math.abs(gradient_pct) >= threshold_pct;
}

/**
 * El cambio NETO de altitud (metros, con signo — positivo = subió) entre el
 * inicio y el final de la ventana del tramo. Null cuando cualquiera de los
 * dos extremos no tiene cobertura fiable — nunca acumula subidas/bajadas
 * intermedias (ver la cabecera del módulo).
 */
export function netAltitudeChangeM(
  altitude: { offsets_s: readonly number[]; values: readonly number[] },
  window_start_s: number,
  window_end_s: number,
): number | null {
  const points = toSortedPoints(altitude.offsets_s, altitude.values);
  const start = valueAtTime(points, window_start_s);
  const end = valueAtTime(points, window_end_s);
  if (start == null || end == null) return null;
  return end - start;
}

/**
 * La pendiente media del tramo, con la precedencia del coach: la cinta manda
 * cuando la hay; si no, el cambio neto de altitud sobre la distancia. Null
 * cuando no hay ninguna de las dos formas de saberlo — nunca cero.
 */
export function resolveSegmentGradientPct(args: {
  /** Inclinación declarada por la cinta (`SegmentActual.incline_pct`), si la hay. */
  treadmill_incline_pct: number | null;
  /** Cambio neto de altitud del tramo (`netAltitudeChangeM`), si se resolvió. */
  altitude_delta_m: number | null;
  distance_m: number | null;
}): number | null {
  if (args.treadmill_incline_pct != null && Number.isFinite(args.treadmill_incline_pct)) {
    return args.treadmill_incline_pct;
  }
  if (
    args.altitude_delta_m != null &&
    Number.isFinite(args.altitude_delta_m) &&
    args.distance_m != null &&
    args.distance_m > 0
  ) {
    return (args.altitude_delta_m / args.distance_m) * 100;
  }
  return null;
}
