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

/** Mismo umbral que `km-splits.ts` (`MAX_INTERPOLATION_GAP_S`): un hueco de
 *  señal más ancho que esto no se interpola — sería inventar la pendiente
 *  del tramo sobre un silencio de GPS, no medirla. */
const MAX_INTERPOLATION_GAP_S = 120;

interface TimedPoint {
  readonly t: number;
  readonly v: number;
}

function toSortedPoints(offsets_s: readonly number[], values: readonly number[]): TimedPoint[] {
  const n = Math.min(offsets_s.length, values.length);
  const points: TimedPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = offsets_s[i];
    const v = values[i];
    if (t == null || v == null || !Number.isFinite(t) || !Number.isFinite(v)) continue;
    points.push({ t, v });
  }
  points.sort((a, b) => a.t - b.t);
  return points;
}

/**
 * Altitud interpolada LINEALMENTE en el instante `t`. Null cuando `t` cae
 * fuera de lo cubierto por las muestras (antes de la primera o después de
 * la última — extrapolar sería inventar), o cuando el hueco que lo rodea
 * supera `MAX_INTERPOLATION_GAP_S`.
 */
function altitudeAt(points: readonly TimedPoint[], t: number): number | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (t < first.t || t > last.t) return null;
  if (t === first.t) return first.v;
  if (t === last.t) return last.v;
  for (let i = 1; i < points.length; i++) {
    const cur = points[i]!;
    if (cur.t < t) continue;
    const prev = points[i - 1]!;
    if (cur.t - prev.t > MAX_INTERPOLATION_GAP_S) return null;
    if (cur.t === prev.t) return prev.v;
    const frac = (t - prev.t) / (cur.t - prev.t);
    return prev.v + frac * (cur.v - prev.v);
  }
  return null; // inalcanzable con first/last ya comprobados, pero explícito
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
  const start = altitudeAt(points, window_start_s);
  const end = altitudeAt(points, window_end_s);
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
