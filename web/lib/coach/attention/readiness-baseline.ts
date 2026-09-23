// Readiness frente a la BASE PROPIA del atleta — el mecanismo de la señal
// `readiness_low` y de lo que las superficies pintan como «su base» (SPEC §8:
// tendencia, no foto).
//
// MECANISMO (código) vs MÉTODO (umbrales del coach):
//   - La base es la MEDIANA de sus lecturas de los 28 días anteriores a la última
//     (la mediana no se deja arrastrar por un par de días raros), y solo existe
//     con al menos 7 lecturas: con menos, «su normal» todavía no se sabe. Eso es
//     estadística, no método.
//   - Cuánto por debajo de la base, cuántos días seguidos, el suelo que dispara
//     solo y la frescura máxima de la lectura son del coach
//     (`coach_signal_thresholds`, mig 0211).
//
// Puro: sin base de datos. Las lecturas llegan ya en el día del atleta.

import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

/** Ventana de la base, en días anteriores a la lectura más reciente. */
export const READINESS_BASELINE_WINDOW_DAYS = 28;
/** Lecturas mínimas para que exista base. */
export const READINESS_BASELINE_MIN_READINGS = 7;
/** Días de la mini-serie que pintan roster y ficha. */
export const READINESS_TREND_DAYS = 14;
/**
 * Días de historia que hay que cargar para poder evaluar: la base (28) más la
 * racha más larga que un coach puede pedir (14) y la frescura máxima (14).
 */
export const READINESS_HISTORY_DAYS = READINESS_BASELINE_WINDOW_DAYS + 14 + 14;

export interface ReadinessReading {
  /** YYYY-MM-DD, día del atleta. */
  on: string;
  score: number;
}

export interface ReadinessSignalThresholds {
  readiness_critical_floor: number;
  readiness_drop_points: number;
  readiness_drop_days: number;
  readiness_max_age_days: number;
}

function shift(iso: string, days: number): string {
  return isoDateString(addDays(parseIsoDate(iso), days));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000);
}

function byDay(series: ReadonlyArray<ReadinessReading>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of series) m.set(r.on, r.score);
  return m;
}

/** La lectura más reciente, o null. */
export function latestReading(series: ReadonlyArray<ReadinessReading>): ReadinessReading | null {
  let latest: ReadinessReading | null = null;
  for (const r of series) if (latest == null || r.on > latest.on) latest = r;
  return latest;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * La base del atleta respecto a una lectura: mediana (redondeada) de sus
 * lecturas de los 28 días ANTERIORES a `anchor` (la propia no entra), o null si
 * hay menos de 7.
 */
export function readinessBaseline(
  series: ReadonlyArray<ReadinessReading>,
  anchor: string,
): { baseline: number | null; readings: number } {
  const from = shift(anchor, -READINESS_BASELINE_WINDOW_DAYS);
  const values = series.filter((r) => r.on >= from && r.on < anchor).map((r) => r.score);
  if (values.length < READINESS_BASELINE_MIN_READINGS) return { baseline: null, readings: values.length };
  return { baseline: Math.round(median(values)), readings: values.length };
}

/** Los últimos 14 días (el más viejo primero, hoy el último), null donde no hubo lectura. */
export function readinessTrend(
  series: ReadonlyArray<ReadinessReading>,
  today: string,
  days: number = READINESS_TREND_DAYS,
): Array<number | null> {
  const m = byDay(series);
  const out: Array<number | null> = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(m.get(shift(today, -i)) ?? null);
  return out;
}

export interface ReadinessAssessment {
  latest: ReadinessReading | null;
  /** Días entre la última lectura y hoy (0 = hoy). */
  age_days: number | null;
  baseline: number | null;
  baseline_readings: number;
  /** La última lectura está por debajo del suelo crítico del coach. */
  below_floor: boolean;
  /** Días seguidos (acabando en la última lectura) a ≥ X puntos bajo la base. */
  drop_streak_days: number;
  /** Primer día del episodio actual (días seguidos bajo el suelo o bajo la base). */
  episode_start: string | null;
  /** La última lectura es más vieja que la frescura máxima: no describe hoy. */
  stale: boolean;
  fires: boolean;
  severity: 'critical' | 'warning' | null;
}

/**
 * ¿Hay que avisar al coach del readiness de este atleta?
 *
 *   - Suelo: la última lectura por debajo del suelo crítico → CRÍTICO, con o sin
 *     base (una lectura muy baja es «actúa hoy»).
 *   - Tendencia: ≥ X puntos por debajo de su base durante N días seguidos
 *     (acabando en la última lectura; un día sin lectura corta la racha) → VIGILAR.
 *   - Frescura: nada dispara si la última lectura tiene más de M días.
 */
export function assessReadiness(
  series: ReadonlyArray<ReadinessReading>,
  today: string,
  t: ReadinessSignalThresholds,
): ReadinessAssessment {
  const latest = latestReading(series);
  if (latest == null) {
    return {
      latest: null,
      age_days: null,
      baseline: null,
      baseline_readings: 0,
      below_floor: false,
      drop_streak_days: 0,
      episode_start: null,
      stale: true,
      fires: false,
      severity: null,
    };
  }

  const age_days = Math.max(0, daysBetween(latest.on, today));
  const stale = age_days > t.readiness_max_age_days;
  const { baseline, readings } = readinessBaseline(series, latest.on);
  const m = byDay(series);

  const isDrop = (score: number) =>
    baseline != null && score <= baseline - t.readiness_drop_points;
  const isFlagged = (score: number) => score < t.readiness_critical_floor || isDrop(score);

  let drop_streak_days = 0;
  for (let d = latest.on; ; d = shift(d, -1)) {
    const v = m.get(d);
    if (v == null || !isDrop(v)) break;
    drop_streak_days += 1;
  }

  let episode_start: string | null = null;
  for (let d = latest.on; ; d = shift(d, -1)) {
    const v = m.get(d);
    if (v == null || !isFlagged(v)) break;
    episode_start = d;
  }

  const below_floor = latest.score < t.readiness_critical_floor;
  const trending = drop_streak_days >= t.readiness_drop_days;
  const fires = !stale && (below_floor || trending);

  return {
    latest,
    age_days,
    baseline,
    baseline_readings: readings,
    below_floor,
    drop_streak_days,
    episode_start: fires ? episode_start : null,
    stale,
    fires,
    severity: fires ? (below_floor ? 'critical' : 'warning') : null,
  };
}
