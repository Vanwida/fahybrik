// `hr_recovery_60_bpm` (migración 0154, huérfana hasta esta tanda): cuánto cae
// el pulso en los 60 s siguientes al final del esfuerzo.
//
// NO ES UN CRITERIO NUEVO. `HRRecoveryCapture` (ios/FAHYBRIK/Workout/
// HRRecovery.swift) ya hace exactamente esto para los tests guiados de
// calibración, y está bien hecho: media en ±5 s, exige cobertura real a los
// 58 s o devuelve null, descarta una caída negativa como artefacto. Este módulo
// es ESE MISMO criterio, en servidor, para que una carrera cualquiera —no solo
// un test guiado— lo alimente. Los umbrales están copiados 1:1 de las
// constantes de esa clase; si algún día cambian allí, cambian aquí. Inventar un
// segundo criterio para el mismo hecho es justo el error que `strap` evitó al
// alinearse con `segment_executions.hr_source` en vez de crear un vocabulario
// paralelo.

/** Una señal tal y como la guarda `workout_traces`. */
export interface RunningTraceSeries {
  readonly offsets_s: readonly number[];
  readonly values: readonly number[];
}

export interface HrRecoveryInput {
  hr: RunningTraceSeries;
  /** Segundos desde el inicio de la traza en que terminó el esfuerzo — el
   *  ancla de la que cuelgan los −10 s (hrEnd) y los +60 s (hr60). La resuelve
   *  el llamador: el final del último tramo de TRABAJO (excluye una vuelta a
   *  la calma o un trote de recuperación grabados después), o el final de la
   *  ejecución cuando no hay tramos con los que anclar. */
  effort_end_s: number;
}

// Espejo EXACTO de HRRecoveryCapture (HRRecovery.swift):
/** Cuánto hacia atrás del final del esfuerzo promedia `hrEnd`. */
const EFFORT_TAIL_S = 10;
/** La marca de recuperación: segundos tras el final del esfuerzo. */
const HR60_OFFSET_S = 60;
/** Las muestras dentro de ±tolerancia de la marca promedian a `hr60`. */
const HR60_TOLERANCE_S = 5;
/** `hr60` exige al menos una muestra a partir de aquí — prueba de que la
 *  traza alcanzó de verdad los 60 s (un corte a los 57 s NO es un valor a 60 s). */
const HR60_COVERAGE_S = 58;

interface TimedPoint {
  readonly t: number;
  readonly v: number;
}

function toPoints(series: RunningTraceSeries): TimedPoint[] {
  const n = Math.min(series.offsets_s.length, series.values.length);
  const points: TimedPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = series.offsets_s[i];
    const v = series.values[i];
    if (t == null || v == null || !Number.isFinite(t) || !Number.isFinite(v)) continue;
    points.push({ t, v });
  }
  return points;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

/**
 * Cuánto cayó el pulso en los 60 s siguientes al final del esfuerzo, o null sin
 * cobertura real (nunca un guess). Cada paso redondea a entero ANTES del
 * siguiente, igual que `HRRecoveryCapture.mean()` en Swift — para que el mismo
 * hecho dé el mismo número en las dos plataformas, no solo un número parecido.
 */
export function computeHrRecovery60(input: HrRecoveryInput): number | null {
  const points = toPoints(input.hr);
  if (points.length === 0) return null;
  const end = input.effort_end_s;

  const tail = points
    .filter((p) => p.t >= end - EFFORT_TAIL_S && p.t <= end)
    .map((p) => p.v);
  const hrEnd = mean(tail);
  if (hrEnd == null) return null;

  const mark = end + HR60_OFFSET_S;
  const band = points.filter((p) => Math.abs(p.t - mark) <= HR60_TOLERANCE_S);
  const hasCoverage = band.some((p) => p.t >= end + HR60_COVERAGE_S);
  if (!hasCoverage) return null;

  const hr60 = mean(band.map((p) => p.v));
  if (hr60 == null) return null;

  const drop = hrEnd - hr60;
  return drop >= 0 ? drop : null;
}
