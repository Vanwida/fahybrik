// El corte por kilómetro de una carrera: UNA fuente (la traza cruda de
// `workout_traces`), N proyecciones — docs/DECISIONS.md, 2026-08-11 "La carrera
// guarda su NEGATIVO". Los kilómetros NUNCA se persisten; este módulo es el
// único sitio que sabe derivarlos, para que una sesión antigua sin traza no
// tenga splits en vez de tener splits inventados, y para que mejorar el
// algoritmo no exija rehacer filas.
//
// EL MODELO
// ---------
// `distance` (metros acumulados desde el inicio) es la ÚNICA señal obligatoria:
// es la que define DÓNDE está cada kilómetro — el instante en que cruza cada
// múltiplo de 1000 m es, por construcción, el fin de un tramo. `speed`, `hr` y
// `altitude` son opcionales y enriquecen cada tramo (ritmo por velocímetro,
// pulso medio, desnivel); su ausencia nunca impide cortar los kilómetros, solo
// deja esos campos en null.
//
// LA CADENCIA ES VARIABLE A PROPÓSITO (mig 0156): las muestras llegan a ~5 s de
// media con huecos de hasta 81 s, y NUNCA se rellenan. El cruce de cada
// kilómetro interpola linealmente el instante entre las dos muestras de
// distancia que lo rodean — la única suposición honesta posible con una serie
// irregular. Cuando el hueco que rodea (o atraviesa) un tramo es tan grande que
// esa suposición deja de sostenerse, el tramo se declara SIN COBERTURA (null)
// en vez de inventar un ritmo — ver `MAX_INTERPOLATION_GAP_S`.
//
// EL ÚLTIMO KILÓMETRO CASI NUNCA ESTÁ COMPLETO. La cola —desde el último
// múltiplo de 1000 m cruzado hasta la última muestra— se devuelve como un split
// PARCIAL con su distancia real: nunca redondeada, nunca escondida.
//
// Unidad: SIEMPRE kilómetros (nunca millas) — no es un ajuste de coach, es la
// unidad del deporte tal y como lo mide el resto de este esquema.

/** Una señal tal y como la guarda `workout_traces`: dos arrays paralelos, eje
 *  explícito. Sin `signal`/`source`/`started_at` — este módulo no necesita
 *  etiquetar la señal, el llamador ya la coloca en el campo correcto de
 *  {@link KmSplitsInput}. */
export interface RunningTraceSeries {
  readonly offsets_s: readonly number[];
  readonly values: readonly number[];
}

/** Lo que hace falta para cortar una carrera por kilómetro. */
export interface KmSplitsInput {
  /** Metros acumulados desde el inicio de la sesión. Única serie obligatoria. */
  distance: RunningTraceSeries;
  /** m/s. Cuando hay muestras dentro de la ventana de un tramo, su media
   *  sustituye al ritmo geométrico (distancia/tiempo): el velocímetro (a
   *  menudo Doppler en GPS moderno) es más estable que dividir 1000 m entre un
   *  cruce interpolado, sensible al jitter de posición. */
  speed: RunningTraceSeries | null;
  /** bpm. */
  hr: RunningTraceSeries | null;
  /** Metros sobre el nivel del mar. */
  altitude: RunningTraceSeries | null;
}

export interface KmSplit {
  /** 1-based: el primer kilómetro es 1, nunca 0. */
  index: number;
  /** true SOLO en el último elemento, y solo cuando la carrera no terminó
   *  exactamente en un múltiplo de 1000 m. */
  partial: boolean;
  /** 1000 para un tramo completo; la distancia real restante para el parcial. */
  distance_m: number;
  /** null = el cruce que abre o cierra este tramo (o un hueco dentro de él) no
   *  se puede interpolar con honestidad — ver `MAX_INTERPOLATION_GAP_S`. */
  duration_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  /** Suma de subidas entre muestras de altitud consecutivas dentro del tramo.
   *  null sin altitud, o con menos de dos muestras en la ventana. */
  elevation_gain_m: number | null;
}

/**
 * Hueco máximo (segundos) entre dos muestras consecutivas de `distance` para
 * seguir considerando fiable cualquier tramo que ese hueco toque. La cadencia
 * REAL medida (mig 0156) llega hasta 81 s como algo normal; este techo deja
 * margen sobre eso (una racha de señal débil puntual) sin llegar a tragarse una
 * pausa real — el móvil guardado, un semáforo largo, un track perdido — que es
 * exactamente el caso que NO se puede interpolar como ritmo constante sin
 * fabricar el dato.
 */
export const MAX_INTERPOLATION_GAP_S = 120;

/** Margen (metros) para no reportar un kilómetro parcial fantasma cuando la
 *  última muestra cae, por redondeo de float, apenas por encima de un múltiplo
 *  exacto de 1000 m. */
const PARTIAL_EPSILON_M = 1;

interface TimedPoint {
  readonly t: number;
  readonly v: number;
}

/** `offsets_s` + `values` → pares (t, v) ORDENADOS POR TIEMPO. El escritor
 *  garantiza el eje estrictamente creciente (mig 0156), pero esta función es
 *  pública y se prueba a propósito contra un eje desordenado — ordena en vez de
 *  confiar. Un índice sin pareja (arrays desalineados) o un valor no finito se
 *  descarta en silencio: nunca lanza, nunca fabrica un punto. */
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

/** Media de los valores cuyo instante cae en [start, end] (ambos inclusive).
 *  null cuando no hay ninguno — nunca 0, que sería un dato fabricado. */
function meanInWindow(points: TimedPoint[], start: number, end: number): number | null {
  let sum = 0;
  let count = 0;
  for (const p of points) {
    if (p.t >= start && p.t <= end) {
      sum += p.v;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

/** Suma de subidas (deltas positivos) entre muestras consecutivas de altitud
 *  dentro de [start, end]. null con menos de dos muestras en la ventana — con
 *  una sola no hay delta que sumar. Sin suavizado de ruido GPS a propósito: es
 *  la misma simplificación que T3 (docs/correr-analitica.html §10) deja para
 *  más adelante a nivel de sesión completa. */
function elevationGainInWindow(points: TimedPoint[], start: number, end: number): number | null {
  const inWindow = points.filter((p) => p.t >= start && p.t <= end);
  if (inWindow.length < 2) return null;
  let gain = 0;
  for (let i = 1; i < inWindow.length; i++) {
    const delta = inWindow[i]!.v - inWindow[i - 1]!.v;
    if (delta > 0) gain += delta;
  }
  return gain;
}

/**
 * ¿Hay algún hueco entre muestras consecutivas de `points` que se solape con
 * [start, end] y supere `MAX_INTERPOLATION_GAP_S`? Cubre tanto un hueco EN el
 * borde (el propio par que interpola el cruce) como uno enteramente DENTRO del
 * tramo (dos cruces bien fijados con un agujero de señal en medio): los dos
 * hacen que el ritmo/pulso medio del tramo deje de ser honesto.
 */
function hasOversizedGap(points: TimedPoint[], start: number, end: number): boolean {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const overlaps = prev.t < end && cur.t > start;
    if (overlaps && cur.t - prev.t > MAX_INTERPOLATION_GAP_S) return true;
  }
  return false;
}

/**
 * El instante (segundos, fraccional) en que la distancia acumulada cruza
 * `boundary`, interpolado LINEALMENTE entre las dos muestras que lo rodean —
 * la única suposición honesta con una serie irregular. null cuando `boundary`
 * cae antes de (o exactamente en) la primera muestra: no hay muestra ANTERIOR
 * de la que interpolar, así que el cruce ya pasó fuera de lo grabado.
 */
function interpolateCrossing(points: TimedPoint[], boundary: number): number | null {
  let idx = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.v >= boundary) {
      idx = i;
      break;
    }
  }
  if (idx <= 0) return null; // no encontrado, o ya superado en la primera muestra
  const prev = points[idx - 1]!;
  const cur = points[idx]!;
  if (cur.v === prev.v) return prev.t; // tramo plano exacto sobre el límite
  const frac = (boundary - prev.v) / (cur.v - prev.v);
  return prev.t + frac * (cur.t - prev.t);
}

/**
 * Corta una traza de carrera por kilómetro. Devuelve un elemento por cada
 * múltiplo de 1000 m alcanzado (índice 1, 2, 3…, SIEMPRE presente aunque su
 * cruce no sea fiable — entonces solo `distance_m` se sabe) más, cuando la
 * carrera no terminó justo en un múltiplo, un último elemento PARCIAL con su
 * distancia real. Array vacío cuando la traza no cubre ni un metro útil.
 *
 * Nota sobre los cruces encadenados: que el kilómetro k se declare sin
 * cobertura (un hueco grande EN MEDIO de su ventana) no invalida el instante en
 * que se cruzó su límite de cierre si ESE cruce en concreto se interpoló entre
 * muestras cercanas — por eso el kilómetro k+1 puede seguir siendo fiable justo
 * después de uno que no lo fue. Son dos preguntas distintas: cuándo se cruzó
 * una marca (una interpolación puntual) y si el tramo completo tuvo cobertura
 * (¿hay algún agujero en toda su ventana?).
 */
export function computeKmSplits(input: KmSplitsInput): KmSplit[] {
  const distancePoints = toSortedPoints(input.distance);
  if (distancePoints.length === 0) return [];

  const speedPoints = input.speed ? toSortedPoints(input.speed) : [];
  const hrPoints = input.hr ? toSortedPoints(input.hr) : [];
  const altitudePoints = input.altitude ? toSortedPoints(input.altitude) : [];

  const lastPoint = distancePoints[distancePoints.length - 1]!;
  const finalDistance = lastPoint.v;
  if (finalDistance <= 0) return [];

  const fullKm = Math.floor(finalDistance / 1000);

  // crossings[0] = 0 (el inicio de la sesión, siempre conocido — es la
  // definición de "segundo 0", no una interpolación). crossings[k] = instante
  // interpolado del kilómetro k, o null si boundary cae fuera de lo grabado.
  const crossings: Array<number | null> = [0];
  for (let k = 1; k <= fullKm; k++) {
    crossings.push(interpolateCrossing(distancePoints, k * 1000));
  }

  const buildSplit = (index: number, partial: boolean, distanceM: number): KmSplit => {
    const start = crossings[index - 1] ?? null;
    // El límite de cierre: el propio cruce interpolado para un tramo completo,
    // o el final real de la traza para el parcial (no tiene cruce que cortar).
    const end = partial ? lastPoint.t : (crossings[index] ?? null);

    if (start == null || end == null || hasOversizedGap(distancePoints, start, end)) {
      return {
        index,
        partial,
        distance_m: distanceM,
        duration_s: null,
        avg_pace_s_per_km: null,
        avg_hr: null,
        elevation_gain_m: null,
      };
    }

    const durationS = end - start;
    const avgSpeed = meanInWindow(speedPoints, start, end);
    const paceFromSpeed = avgSpeed != null && avgSpeed > 0 ? 1000 / avgSpeed : null;
    const paceFromDistance = durationS > 0 ? durationS / (distanceM / 1000) : null;

    return {
      index,
      partial,
      distance_m: distanceM,
      duration_s: durationS,
      // El velocímetro manda cuando hay muestras en la ventana (más estable);
      // la geometría distancia/tiempo es el respaldo, siempre disponible.
      avg_pace_s_per_km: paceFromSpeed ?? paceFromDistance,
      avg_hr: meanInWindow(hrPoints, start, end),
      elevation_gain_m: elevationGainInWindow(altitudePoints, start, end),
    };
  };

  const splits: KmSplit[] = [];
  for (let k = 1; k <= fullKm; k++) {
    splits.push(buildSplit(k, false, 1000));
  }

  const partialDistance = finalDistance - fullKm * 1000;
  if (partialDistance > PARTIAL_EPSILON_M) {
    splits.push(buildSplit(fullKm + 1, true, partialDistance));
  }

  return splits;
}
