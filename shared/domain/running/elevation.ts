// `elevation_gain_m` / `elevation_loss_m` (migración 0154, huérfanas hasta esta
// tanda): el desnivel acumulado de la sesión, separado en subida y bajada
// (subir 300 y bajar 300 no es un llano, y el neto lo borraría).
//
// EL RIESGO REAL: el ruido del sensor infla el desnivel. Sumar a pelo cada
// delta positivo consecutivo de una serie de altitud hace que una tirada
// llana, con ±1-2 m de jitter de GPS en cada muestra, declare cientos de
// metros de subida — y encima en la dirección que más halaga al atleta, que es
// la peor manera de mentir.
//
// EL FILTRO: histéresis contra una línea base, no una media móvil aparte. Se
// guarda un punto de referencia; una muestra solo cuenta como subida/bajada
// cuando se aleja de esa referencia MÁS que el umbral de ruido — momento en el
// que la referencia salta a la muestra actual y el margen recorrido se
// acumula. Mientras la señal solo tiembla dentro del umbral, la referencia no
// se mueve y no se acumula nada: es exactamente el comportamiento que hace que
// una traza llana con ruido dé ~0, no 200 (el test que acepta este módulo). Es
// el mismo principio con el que las herramientas GPS de referencia (Strava,
// Garmin, GPSBabel) filtran el desnivel: un "gain threshold" fijo, no un
// suavizado que solo difumina el ruido sin eliminarlo.
export interface RunningTraceSeries {
  readonly offsets_s: readonly number[];
  readonly values: readonly number[];
}

export interface ElevationInput {
  altitude: RunningTraceSeries;
}

export interface ElevationResult {
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
}

/**
 * Umbral de histéresis, metros. La altitud por GPS (CLLocation) ronda ±3-5 m de
 * error en condiciones normales; la barométrica (HKWorkoutRoute, FTMS) es más
 * fina, pero esta función recibe una sola serie sin saber de cuál procede, así
 * que se calibra para la fuente MÁS ruidosa de las tres que alimentan esta
 * columna (mig 0154). 3 m absorbe el jitter típico de GPS sin necesitar saber
 * la fuente, y sigue siendo sensible a una cuesta real de un solo tramo.
 */
export const ELEVATION_NOISE_THRESHOLD_M = 3;

interface TimedPoint {
  readonly t: number;
  readonly v: number;
}

function toSortedPoints(series: RunningTraceSeries): TimedPoint[] {
  const n = Math.min(series.offsets_s.length, series.values.length);
  const points: TimedPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = series.offsets_s[i];
    const v = series.values[i];
    if (t == null || v == null || !Number.isFinite(t) || !Number.isFinite(v)) continue;
    points.push({ t, v });
  }
  points.sort((a, b) => a.t - b.t);
  return points;
}

/**
 * Desnivel acumulado de una serie de altitud, con filtro de histéresis contra
 * el ruido del sensor. null con menos de dos muestras útiles (no hay delta que
 * medir) — nunca 0, que sería indistinguible de "se midió y no hubo desnivel".
 */
export function computeElevation(input: ElevationInput): ElevationResult {
  const points = toSortedPoints(input.altitude);
  if (points.length < 2) return { elevation_gain_m: null, elevation_loss_m: null };

  let baseline = points[0]!.v;
  let gain = 0;
  let loss = 0;

  for (let i = 1; i < points.length; i++) {
    const delta = points[i]!.v - baseline;
    if (delta >= ELEVATION_NOISE_THRESHOLD_M) {
      gain += delta;
      baseline = points[i]!.v;
    } else if (delta <= -ELEVATION_NOISE_THRESHOLD_M) {
      loss += -delta;
      baseline = points[i]!.v;
    }
    // Dentro de la banda de ruido: la referencia no se mueve, nada se acumula.
  }

  return { elevation_gain_m: gain, elevation_loss_m: loss };
}
