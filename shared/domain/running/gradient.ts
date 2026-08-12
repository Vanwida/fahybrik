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
