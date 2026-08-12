// INTERPOLACIÓN DE UNA SERIE (t, v) — pieza compartida. `gradient.ts` la usa
// para "¿qué altitud había en el instante t?"; `route-zones.ts` la usa para
// las dos preguntas: "¿qué velocidad había en t?" y su inversa, "¿en qué
// instante la distancia acumulada cruzó esta marca?". Es la TERCERA vez que
// aparece este cálculo en `shared/domain/running/` — `km-splits.ts` tiene su
// propia copia privada, ANTERIOR a ésta y ya en producción; se deja sin
// tocar a propósito (mismo criterio que el resto de esta noche: no ampliar
// el frente sobre un fichero ya enviado por un beneficio marginal). Si algún
// día se unifica, esta es la forma a la que converger.
//
// EL CRITERIO DE HUECO es el mismo en las tres: un hueco de señal más ancho
// que `MAX_INTERPOLATION_GAP_S` no se interpola — sería inventar el valor
// sobre un silencio de GPS, no medirlo.

export const MAX_INTERPOLATION_GAP_S = 120;

export interface TimedPoint {
  readonly t: number;
  readonly v: number;
}

/** `offsets_s` + `values` → pares (t, v) ordenados por tiempo. Un índice sin
 *  pareja o un valor no finito se descarta en silencio: nunca lanza, nunca
 *  fabrica un punto. */
export function toSortedPoints(offsets_s: readonly number[], values: readonly number[]): TimedPoint[] {
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
 * El valor interpolado LINEALMENTE en el instante `t`. Null cuando `t` cae
 * fuera de lo cubierto por las muestras (antes de la primera o después de la
 * última — extrapolar sería inventar), o cuando el hueco que lo rodea supera
 * `MAX_INTERPOLATION_GAP_S`.
 */
export function valueAtTime(points: readonly TimedPoint[], t: number): number | null {
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
 * El instante (fraccional, segundos) en que una señal ACUMULATIVA (creciente
 * o igual, como una distancia) cruza `boundary`, interpolado linealmente
 * entre las dos muestras que lo rodean. Null cuando `boundary` cae antes de
 * (o exactamente en) la primera muestra — no hay muestra ANTERIOR de la que
 * interpolar, así que el cruce ya pasó fuera de lo grabado — o cuando nunca
 * se alcanza, o cuando el hueco que lo rodea supera el margen.
 */
export function timeAtValue(points: readonly TimedPoint[], boundary: number): number | null {
  let idx = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.v >= boundary) {
      idx = i;
      break;
    }
  }
  if (idx <= 0) return null;
  const prev = points[idx - 1]!;
  const cur = points[idx]!;
  if (cur.t - prev.t > MAX_INTERPOLATION_GAP_S) return null;
  if (cur.v === prev.v) return prev.t;
  const frac = (boundary - prev.v) / (cur.v - prev.v);
  return prev.t + frac * (cur.t - prev.t);
}
