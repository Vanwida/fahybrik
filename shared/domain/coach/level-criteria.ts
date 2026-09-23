// @fahybrid/shared/domain/coach/level-criteria — qué marca abre cada nivel del
// coach, y la sugerencia de nivel que sale de ahí.
//
// MECANISMO vs MÉTODO (HARD RULE Nº0)
// -----------------------------------
// Leer las marcas de un atleta, colocarlo en la escalera de niveles del coach y
// promediar varias señales es MECANISMO: igual para todos. DÓNDE corta cada
// escalón es MÉTODO — otro entrenador pone su N3 en 1h15′ de HYROX, o no usa
// marcas para su eje en absoluto (agrupa por turno o por objetivo). Así que:
//
//   · los cortes son DATO del coach (`athlete_level_criteria`, mig 0259), por
//     nivel, y un nivel con `criteria_set_at` NULL usa el DEFECTO del producto
//     según su POSICIÓN en la escalera (no según su nombre: antes se buscaba el
//     nivel llamado literalmente 'N'+n y un coach con otros nombres nunca recibía
//     una sugerencia, sin que nadie se lo dijera);
//   · cuando no se puede sugerir, se dice por qué (`LevelSuggestion.status`).
//
// Los defectos son los cortes de siempre (antes `level-algorithm.ts`), así que
// un coach con cinco niveles que no toca nada recibe las mismas sugerencias que
// antes.
//
// Puro y sin base de datos.

/** Las marcas que el sistema sabe leer de un atleta. Conjunto cerrado (CHECK en la tabla). */
export const LEVEL_METRICS = ['hyrox_s', 'run_5k_s', 'row_2k_s', 'squat_bw', 'experience_years'] as const;
export type LevelMetric = (typeof LEVEL_METRICS)[number];

export type LevelSex = 'male' | 'female';

/** Cómo se lee cada marca: tiempos (se entra POR DEBAJO) o cantidades (se entra POR ENCIMA). */
export interface LevelMetricSpec {
  metric: LevelMetric;
  label: string;
  /** Tiempo en segundos (menos es mejor) o número (más es mejor). */
  kind: 'time' | 'number';
  /** El corte distingue hombres y mujeres. */
  by_sex: boolean;
  unit: string;
  /** Solo cuenta cuando no hay ninguna otra marca (los años no miden rendimiento). */
  fallback_only: boolean;
  min: number;
  max: number;
}

export const LEVEL_METRIC_SPEC: Record<LevelMetric, LevelMetricSpec> = {
  hyrox_s: { metric: 'hyrox_s', label: 'HYROX individual', kind: 'time', by_sex: true, unit: 'h:mm:ss', fallback_only: false, min: 1800, max: 4 * 3600 },
  run_5k_s: { metric: 'run_5k_s', label: '5 km', kind: 'time', by_sex: true, unit: 'mm:ss', fallback_only: false, min: 600, max: 3600 },
  row_2k_s: { metric: 'row_2k_s', label: 'Remo 2000 m', kind: 'time', by_sex: true, unit: 'm:ss', fallback_only: false, min: 300, max: 900 },
  squat_bw: { metric: 'squat_bw', label: 'Sentadilla', kind: 'number', by_sex: false, unit: 'veces tu peso', fallback_only: false, min: 0.1, max: 4 },
  experience_years: { metric: 'experience_years', label: 'Años entrenando', kind: 'number', by_sex: false, unit: 'años', fallback_only: true, min: 0.5, max: 40 },
};

/** Un corte de ENTRADA a un nivel. `sex` null = vale para cualquiera. */
export interface LevelCriterion {
  metric: LevelMetric;
  sex: LevelSex | null;
  threshold: number;
}

/**
 * Los cortes por defecto, por POSICIÓN en la escalera (1 = el primero). El
 * primer escalón no tiene corte: es donde está quien no alcanza el segundo. Del
 * sexto en adelante no hay defecto: un coach con más niveles decide él qué los
 * abre. Son los números que el producto ha usado siempre.
 */
const DEFAULT_ENTRY: Record<number, LevelCriterion[]> = {
  2: [
    { metric: 'hyrox_s', sex: 'male', threshold: 5400 },
    { metric: 'hyrox_s', sex: 'female', threshold: 6000 },
    { metric: 'run_5k_s', sex: 'male', threshold: 1680 },
    { metric: 'run_5k_s', sex: 'female', threshold: 1920 },
    { metric: 'row_2k_s', sex: 'male', threshold: 480 },
    { metric: 'row_2k_s', sex: 'female', threshold: 560 },
    { metric: 'squat_bw', sex: null, threshold: 0.9 },
    { metric: 'experience_years', sex: null, threshold: 1 },
  ],
  3: [
    { metric: 'hyrox_s', sex: 'male', threshold: 4500 },
    { metric: 'hyrox_s', sex: 'female', threshold: 5100 },
    { metric: 'run_5k_s', sex: 'male', threshold: 1440 },
    { metric: 'run_5k_s', sex: 'female', threshold: 1620 },
    { metric: 'row_2k_s', sex: 'male', threshold: 440 },
    { metric: 'row_2k_s', sex: 'female', threshold: 510 },
    { metric: 'squat_bw', sex: null, threshold: 1.2 },
    { metric: 'experience_years', sex: null, threshold: 3 },
  ],
  4: [
    { metric: 'hyrox_s', sex: 'male', threshold: 3900 },
    { metric: 'hyrox_s', sex: 'female', threshold: 4500 },
    { metric: 'run_5k_s', sex: 'male', threshold: 1260 },
    { metric: 'run_5k_s', sex: 'female', threshold: 1440 },
    { metric: 'row_2k_s', sex: 'male', threshold: 410 },
    { metric: 'row_2k_s', sex: 'female', threshold: 470 },
    { metric: 'squat_bw', sex: null, threshold: 1.5 },
    { metric: 'experience_years', sex: null, threshold: 5 },
  ],
  5: [
    { metric: 'hyrox_s', sex: 'male', threshold: 3300 },
    { metric: 'hyrox_s', sex: 'female', threshold: 3900 },
    { metric: 'run_5k_s', sex: 'male', threshold: 1080 },
    { metric: 'run_5k_s', sex: 'female', threshold: 1260 },
    { metric: 'row_2k_s', sex: 'male', threshold: 380 },
    { metric: 'row_2k_s', sex: 'female', threshold: 440 },
    { metric: 'squat_bw', sex: null, threshold: 1.8 },
  ],
};

/** Los cortes por defecto del escalón `position` (1-based). Copia fresca. */
export function defaultLevelCriteria(position: number): LevelCriterion[] {
  return (DEFAULT_ENTRY[position] ?? []).map((c) => ({ ...c }));
}

/** Un nivel ACTIVO del coach, en su orden, con lo que guardó. */
export interface LadderLevel {
  id: string;
  name: string;
  /** NULL = usa el defecto por posición. */
  criteria_set_at: string | null;
  /** Sus filas (solo cuentan si `criteria_set_at` no es nulo). */
  criteria: LevelCriterion[];
}

export interface ResolvedRung {
  id: string;
  name: string;
  position: number;
  criteria: LevelCriterion[];
  /** true = son los del producto (el coach no los ha tocado). */
  is_default: boolean;
}

/** La escalera vigente: cada nivel activo con los cortes que mandan. */
export function resolveLadder(levels: readonly LadderLevel[]): ResolvedRung[] {
  return levels.map((l, i) => {
    const position = i + 1;
    const custom = l.criteria_set_at != null;
    return {
      id: l.id,
      name: l.name,
      position,
      criteria: custom ? l.criteria.map((c) => ({ ...c })) : defaultLevelCriteria(position),
      is_default: !custom,
    };
  });
}

/** Las marcas de un atleta, ya en las unidades de las métricas. */
export type AthleteMarks = Partial<Record<LevelMetric, number>>;

export type LevelSuggestion =
  | {
      status: 'suggested';
      level_id: string;
      level_name: string;
      position: number;
      confidence: 'low' | 'medium' | 'high';
      signals: LevelMetric[];
    }
  /** El coach no tiene niveles activos: no hay dónde colocarlo. */
  | { status: 'no_levels' }
  /** Ningún nivel se abre por marcas (el eje del coach no es de rendimiento, o no ha puesto cortes). */
  | { status: 'no_criteria' }
  /** El atleta no tiene ninguna marca que los cortes del coach lean. */
  | { status: 'no_signals' };

function meets(spec: LevelMetricSpec, value: number, threshold: number): boolean {
  return spec.kind === 'time' ? value <= threshold : value >= threshold;
}

/** El corte de un escalón para una marca y un sexo: el de su sexo, si no el de cualquiera. */
function criterionFor(rung: ResolvedRung, metric: LevelMetric, sex: LevelSex): LevelCriterion | null {
  return (
    rung.criteria.find((c) => c.metric === metric && c.sex === sex) ??
    rung.criteria.find((c) => c.metric === metric && c.sex == null) ??
    null
  );
}

/**
 * El escalón de UNA marca: el más alto cuyo corte cumple. Si la marca se lee en
 * la escalera pero no alcanza ningún corte, el primer escalón. Null si ningún
 * escalón usa esa marca (no es una señal para este coach).
 */
function rungForMetric(ladder: ResolvedRung[], metric: LevelMetric, value: number, sex: LevelSex): number | null {
  const spec = LEVEL_METRIC_SPEC[metric];
  let used = false;
  let best = 1;
  for (const rung of ladder) {
    const c = criterionFor(rung, metric, sex);
    if (!c) continue;
    used = true;
    if (meets(spec, value, c.threshold)) best = Math.max(best, rung.position);
  }
  return used ? best : null;
}

/**
 * La sugerencia. Cada marca da un escalón; se promedian y se redondea (como
 * siempre). Los años solo cuentan si no hay ninguna marca de rendimiento. Un
 * atleta sin sexo conocido se lee con los cortes de hombre, como siempre lo ha
 * hecho el producto (anotado en DECISIONS 2026-09-23 «Qué marca abre cada nivel»).
 */
export function suggestLevelOnLadder(
  ladder: ResolvedRung[],
  marks: AthleteMarks,
  sex: LevelSex | null,
): LevelSuggestion {
  if (ladder.length === 0) return { status: 'no_levels' };
  if (ladder.every((r) => r.criteria.length === 0)) return { status: 'no_criteria' };
  const s: LevelSex = sex ?? 'male';

  const signals: Array<{ metric: LevelMetric; rung: number }> = [];
  for (const metric of LEVEL_METRICS) {
    if (LEVEL_METRIC_SPEC[metric].fallback_only) continue;
    const v = marks[metric];
    if (v == null || !Number.isFinite(v) || v <= 0) continue;
    const rung = rungForMetric(ladder, metric, v, s);
    if (rung != null) signals.push({ metric, rung });
  }
  if (signals.length === 0) {
    for (const metric of LEVEL_METRICS) {
      if (!LEVEL_METRIC_SPEC[metric].fallback_only) continue;
      const v = marks[metric];
      if (v == null || !Number.isFinite(v) || v < 0) continue;
      const rung = rungForMetric(ladder, metric, v, s);
      if (rung != null) signals.push({ metric, rung });
    }
  }
  if (signals.length === 0) return { status: 'no_signals' };

  const avg = signals.reduce((sum, x) => sum + x.rung, 0) / signals.length;
  const position = Math.max(1, Math.min(ladder.length, Math.round(avg)));
  const rung = ladder[position - 1]!;
  return {
    status: 'suggested',
    level_id: rung.id,
    level_name: rung.name,
    position,
    confidence: signals.length >= 3 ? 'high' : signals.length === 2 ? 'medium' : 'low',
    signals: signals.map((x) => x.metric),
  };
}

/** Qué decir cuando no hay sugerencia (una línea, palabras del coach). */
export function levelSuggestionGap(s: LevelSuggestion, axisLabel: string): string | null {
  const axis = axisLabel.toLowerCase();
  switch (s.status) {
    case 'suggested':
      return null;
    case 'no_levels':
      return `No hay ${axis} que sugerir: todavía no has creado ninguno.`;
    case 'no_criteria':
      return `Sin sugerencia: ningún ${axis} tuyo se abre por marcas.`;
    case 'no_signals':
      return 'Sin sugerencia: el atleta no tiene marcas que tus cortes lean.';
  }
}

// ── Relojes para el editor ─────────────────────────────────────────────────────

/** «1:15:00», «21:00», «7:20» → segundos. Null si no se entiende. */
export function parseClock(raw: string): number | null {
  const t = raw.trim().replace(/[′']/g, ':').replace(/[″"]/g, '').replace(/:$/, '');
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(':').map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  const s = parts.reduce((acc, p) => acc * 60 + p, 0);
  return s > 0 ? s : null;
}

/** Segundos → «1:15:00» (≥ 1 h) o «21:00». */
export function formatClock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
