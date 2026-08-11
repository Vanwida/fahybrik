// `decoupling_pct` (migración 0154, huérfana hasta esta tanda): deriva
// aeróbica por el método estándar del sector (Pa:HR — Friel/TrainingPeaks).
// Factor de eficiencia = velocidad / pulso; se parte el esfuerzo en dos
// mitades y la deriva es cuánto CAYÓ el factor de la primera a la segunda, en
// tanto por ciento. Positivo = te costó más pulso mantener el ritmo.
//
// EL FORMATO NO ES LA PARTE DIFÍCIL — LAS GUARDAS SÍ. Un número de deriva sobre
// una sesión de series es ruido con forma de dato: el método asume un esfuerzo
// SOSTENIDO a intensidad razonablemente constante, y una sesión con
// recuperaciones o con tramos que suben de zona a propósito no lo es. Este
// módulo se niega a calcular en esos casos — null, no un número que parece
// serio y no lo es.
//
// MECANISMO, NO MÉTODO (regla Nº0). El coach ya tiene `decoupling_target_pct` y
// `decoupling_regress_threshold_pct` editables (shared/schema/methodology-
// system.ts) para decidir qué deriva es aceptable. Este módulo NO lee esos
// umbrales ni emite un veredicto — solo el número. El juicio es del coach.

export interface RunningTraceSeries {
  readonly offsets_s: readonly number[];
  readonly values: readonly number[];
}

/** Un tramo de la sesión, en el mismo eje que `hr`/`speed` (segundos desde el
 *  inicio de la traza). Espeja `segment_executions.leg_role`/`leg_phase`
 *  (mig 0146) — el llamador los resuelve desde la base; este módulo no sabe
 *  qué es un `segment_executions`. */
export interface EffortLeg {
  role: 'work' | 'recovery';
  phase: 'warmup' | 'main' | 'cooldown';
  start_s: number;
  end_s: number;
}

export interface DecouplingInput {
  hr: RunningTraceSeries;
  speed: RunningTraceSeries;
  /** Los tramos de la sesión, si los hay. Vacío = sesión SIN estructura de
   *  tramos (una carrera continua, sin gramática de series) — se trata como un
   *  único esfuerzo, con el calentamiento fijo de abajo excluido a falta de uno
   *  etiquetado. */
  legs: readonly EffortLeg[];
}

/**
 * Duración mínima (s) del esfuerzo sostenido para que la comparación
 * primera-mitad/segunda-mitad signifique algo. 20 min es el suelo práctico más
 * citado para un Pa:HR — por debajo, la variabilidad minuto a minuto del pulso
 * pesa más que la propia deriva que se intenta medir.
 */
export const MIN_SUSTAINED_DURATION_S = 1200;

/**
 * Cuánto se descarta al principio cuando NO hay un tramo de calentamiento
 * etiquetado (mig 0146) del que fiarse. 10 min es la convención estándar del
 * método (Friel): el pulso tarda en estabilizarse y esos primeros minutos
 * meterían una caída artificial de EF que no es deriva, es arranque.
 */
export const WARMUP_SKIP_S = 600;

/** Mínimo de muestras de CADA señal en CADA mitad para que su media no sea un
 *  adorno estadístico sobre uno o dos puntos. */
const MIN_SAMPLES_PER_HALF = 4;

/** Hueco máximo (s) tolerado entre muestras consecutivas dentro de una mitad.
 *  Más laxo que el de los splits por kilómetro (120 s): aquí se promedia sobre
 *  una ventana de varios minutos, así que un hueco puntual pesa menos que al
 *  interpolar un cruce exacto — pero sigue habiendo un techo, para que una
 *  mitad casi vacía con dos puntos muy separados no pase por "cobertura real". */
const MAX_COVERAGE_GAP_S = 180;

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

function meanInWindow(points: TimedPoint[], start: number, end: number): number | null {
  const inWindow = points.filter((p) => p.t >= start && p.t <= end);
  if (inWindow.length === 0) return null;
  return inWindow.reduce((sum, p) => sum + p.v, 0) / inWindow.length;
}

/** ¿Tiene esta mitad cobertura real de `points`? Cuenta Y huecos, las dos —
 *  pocas muestras muy separadas pasarían el conteo pero no la razón de ser de
 *  "cobertura". */
function hasCoverage(points: TimedPoint[], start: number, end: number): boolean {
  const inWindow = points.filter((p) => p.t >= start && p.t <= end);
  if (inWindow.length < MIN_SAMPLES_PER_HALF) return false;
  for (let i = 1; i < inWindow.length; i++) {
    if (inWindow[i]!.t - inWindow[i - 1]!.t > MAX_COVERAGE_GAP_S) return false;
  }
  return true;
}

/**
 * Resuelve la ventana del esfuerzo SOSTENIDO principal, o null si la sesión no
 * es elegible. Con tramos: exige EXACTAMENTE un tramo de fase 'main' — cero
 * significa que no hay nada que medir, y dos o más significa que la sesión
 * ALTERNA (series con recuperación) o PROGRESA (tramos distintos a propósito),
 * y en los dos casos el supuesto de esfuerzo constante del método ya no se
 * sostiene; da igual que el segundo tramo sea 'recovery' o 'work'. Sin tramos
 * (carrera sin estructura): toda la traza, menos el calentamiento fijo.
 */
function resolveSustainedWindow(
  legs: readonly EffortLeg[],
  hr: TimedPoint[],
  speed: TimedPoint[],
): { start_s: number; end_s: number } | null {
  if (legs.length > 0) {
    const mainLegs = legs.filter((l) => l.phase === 'main');
    if (mainLegs.length !== 1) return null;
    const only = mainLegs[0]!;
    return { start_s: only.start_s, end_s: only.end_s };
  }

  if (hr.length === 0 || speed.length === 0) return null;
  const start = Math.max(hr[0]!.t, speed[0]!.t) + WARMUP_SKIP_S;
  const end = Math.min(hr[hr.length - 1]!.t, speed[speed.length - 1]!.t);
  return { start_s: start, end_s: end };
}

/**
 * Deriva aeróbica (Pa:HR) en %, o null cuando la sesión no es elegible o no
 * hay cobertura real. Nunca fabrica un número sobre una sesión de series.
 */
export function computeDecoupling(input: DecouplingInput): number | null {
  const hr = toSortedPoints(input.hr);
  const speed = toSortedPoints(input.speed);
  if (hr.length === 0 || speed.length === 0) return null;

  const window = resolveSustainedWindow(input.legs, hr, speed);
  if (!window) return null;
  if (window.end_s - window.start_s < MIN_SUSTAINED_DURATION_S) return null;

  const mid = (window.start_s + window.end_s) / 2;
  const half1 = { start: window.start_s, end: mid };
  const half2 = { start: mid, end: window.end_s };

  if (
    !hasCoverage(hr, half1.start, half1.end) ||
    !hasCoverage(hr, half2.start, half2.end) ||
    !hasCoverage(speed, half1.start, half1.end) ||
    !hasCoverage(speed, half2.start, half2.end)
  ) {
    return null;
  }

  const hr1 = meanInWindow(hr, half1.start, half1.end);
  const hr2 = meanInWindow(hr, half2.start, half2.end);
  const speed1 = meanInWindow(speed, half1.start, half1.end);
  const speed2 = meanInWindow(speed, half2.start, half2.end);
  if (hr1 == null || hr2 == null || speed1 == null || speed2 == null) return null;
  if (hr1 <= 0 || hr2 <= 0) return null;

  const ef1 = speed1 / hr1;
  const ef2 = speed2 / hr2;
  if (ef1 <= 0) return null;

  return ((ef1 - ef2) / ef1) * 100;
}
