// Reducción de una serie para DIBUJAR — nunca para calcular. Una sesión de
// 90 min son miles de puntos por señal; mandarlos todos a un móvil para
// pintar una curva de unos cientos de píxeles es absurdo, así que el
// servidor reduce ANTES de transmitir. Lo que NO puede pasar es que la
// reducción se coma la forma: en una carrera de series, los picos y los
// valles SON el dato — un 6×800 mal reducido puede leerse como un rodaje
// llano, que es mentir con la forma exacta de un gráfico.
//
// EL MÉTODO: histéresis por cubos de mín/máx, no decimación ("uno de cada
// N"). La serie se trocea en cubos contiguos (por ÍNDICE, no por tiempo — la
// cadencia es irregular, así que un cubo por índice da un tamaño de salida
// predecible pase lo que pase con los huecos) y cada cubo aporta SU propio
// mínimo y SU propio máximo, en orden de tiempo. Cualquier pico o valle
// DENTRO de un cubo sobrevive por construcción — nunca puede desaparecer.
//
// POR QUÉ NO LTTB (Largest-Triangle-Three-Buckets, el otro algoritmo
// estándar de reducción para gráficas). LTTB aproxima bien la forma visual de
// una curva SUAVE, pero no garantiza que el mínimo/máximo literal de un cubo
// sobrevivan — elige el punto que forma el triángulo más grande con el
// anterior seleccionado y la media del cubo siguiente, que puede no ser el
// extremo real. Para una señal de picos agudos (una serie de intervalos) esa
// es exactamente la garantía que hace falta, así que mín/máx por cubos es la
// elección correcta aquí, no un atajo.
//
// LA DECIMACIÓN INGENUA ES EL CASO ADVERSARIO QUE ESTO EVITA: una señal que
// oscila con el mismo periodo que el paso de muestreo ("uno de cada N") puede
// caer siempre en la misma fase y enseñar una línea plana donde había una
// sierra entera — es el test que acepta este módulo.
//
// NUNCA RELLENA UN HUECO. Solo SELECCIONA puntos que ya existían; un hueco
// grande en la traza original sigue siendo un hueco (un salto grande en
// `offsets_s`) en la salida — no hace falta lógica aparte para eso.

export interface RunningTraceSeries {
  readonly offsets_s: readonly number[];
  readonly values: readonly number[];
}

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
 * Reduce `series` a como mucho `maxPoints`, conservando extremos locales
 * (picos Y valles) mediante mín/máx por cubos contiguos de índice. Ordena y
 * limpia la entrada igual que el resto de este dominio (eje desordenado,
 * valores no finitos). Sin reducción cuando la serie ya cabe en el
 * presupuesto — nunca infla ni inventa puntos.
 */
export function downsampleSeries(series: RunningTraceSeries, maxPoints: number): RunningTraceSeries {
  const points = toSortedPoints(series);
  if (points.length === 0 || maxPoints <= 0) return { offsets_s: [], values: [] };
  if (points.length <= maxPoints) {
    return { offsets_s: points.map((p) => p.t), values: points.map((p) => p.v) };
  }
  if (maxPoints === 1) {
    const first = points[0]!;
    return { offsets_s: [first.t], values: [first.v] };
  }

  // Cada cubo aporta como mucho 2 puntos (mín + máx), así que el número de
  // cubos es la mitad del presupuesto — la única forma de garantizar que la
  // salida nunca lo supera.
  const bucketCount = Math.floor(maxPoints / 2);
  const out: TimedPoint[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor((b * points.length) / bucketCount);
    const end = Math.floor(((b + 1) * points.length) / bucketCount); // exclusivo
    if (start >= end) continue;

    let minP = points[start]!;
    let maxP = points[start]!;
    for (let i = start + 1; i < end; i++) {
      const p = points[i]!;
      if (p.v < minP.v) minP = p;
      if (p.v > maxP.v) maxP = p;
    }

    if (minP.t === maxP.t) {
      out.push(minP); // un solo punto en el cubo, o mín=máx (cubo plano)
    } else if (minP.t < maxP.t) {
      out.push(minP, maxP);
    } else {
      out.push(maxP, minP);
    }
  }

  // Ya sale en orden de tiempo: los cubos son contiguos en índice (que ya
  // está ordenado por tiempo) y cada par interno se empuja en su propio orden.
  return { offsets_s: out.map((p) => p.t), values: out.map((p) => p.v) };
}
