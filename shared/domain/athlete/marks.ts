// Marcas (#Marcas) — the athlete's self-service benchmark library.
//
// Nobody follows a plan 100%. The day the athlete gets bored, improvises or wants to
// know if they've improved, this catalog turns that hole in the adherence into a data
// point. Three doors, one store (athlete_benchmarks):
//
//   · coach test   → programmed session, its result RECALIBRATES the plan
//   · self-test    → one of the marks below, measured BY THE APP (GPS / treadmill FTMS
//                    for running, PM5 over BLE for ergs). Records + celebrates the PR;
//                    never recalibrates — the coach gets "marca nueva".
//   · registered   → the Sunday 10K. Not measured, registered (picked from a synced
//                    watch activity or typed).
//
// THE CATALOG IS CLOSED on purpose: every mark carries a unit, an improvement
// direction, sanity bounds and (for ergs) the exact machine distance. Free-text marks
// would kill comparability — same lesson as exercise identity (migration 0132).
//
// Framework-agnostic and pure: web routes validate with it, iOS mirrors it, tests pin it.

import {
  BENCH_COOPER_12MIN,
  BENCH_ROW_1K,
  BENCH_ROW_500M,
  BENCH_RUN_10K,
  BENCH_RUN_1K,
  BENCH_RUN_5K,
  BENCH_RUN_HALF,
  BENCH_RUN_MARATHON,
  BENCH_SKI_1K,
  BENCHMARK_UNIT_METERS,
  BENCHMARK_UNIT_SECONDS,
  benchmarkLabel,
} from '../coach/benchmark-slugs';

/** Quién produjo una marca (`athlete_benchmarks.source`, migración 0139). */
export type MarkSource = 'coach_test' | 'athlete_test' | 'registered' | 'onboarding' | 'unknown';

/**
 * Las marcas que el atleta puede BORRAR de su propia biblioteca.
 *
 * Lo que declaró al entrar es SUYO y tiene que poder quitarlo — sin eso, un
 * número tecleado con prisa el primer día se queda para siempre mandando en su
 * mejor marca. Lo que se probó él y lo que registró de una carrera son igual de
 * suyos.
 *
 * `coach_test` NO: es el registro del coach, recalibra el plan, y borrarlo desde
 * el móvil dejaría al coach sin la evidencia con la que programó. `unknown`
 * tampoco: procedencia no fiable (semillas, histórico), y no se borra a ciegas lo
 * que no se sabe de quién es.
 */
const ATHLETE_DELETABLE_SOURCES: ReadonlySet<string> = new Set<MarkSource>([
  'onboarding',
  'athlete_test',
  'registered',
]);

/** True cuando esta marca la produjo el atleta y por tanto puede retirarla. */
export function markIsDeletableByAthlete(source: string): boolean {
  return ATHLETE_DELETABLE_SOURCES.has(source);
}

/** How the number is produced. Decides which UI opens on "Probarme". */
export type MarkMeasuredBy = 'run' | 'erg' | 'registered';

export type MarkGroup = 'run' | 'ergo' | 'race';

/** Where a run mark happened. A treadmill 5K never beats a street 5K. */
export type RunContext = 'outdoor' | 'treadmill';

export interface MarkSpec {
  slug: string;
  label: string;
  group: MarkGroup;
  measured_by: MarkMeasuredBy;
  /** Stored unit: seconds (time trials) or meters (Cooper). */
  unit: typeof BENCHMARK_UNIT_SECONDS | typeof BENCHMARK_UNIT_METERS;
  /** true → a smaller value is an improvement (times). Cooper is the exception. */
  lower_is_better: boolean;
  /**
   * Sanity bounds for the VALUE, inclusive. Generous on purpose — they reject
   * nonsense (a 30-minute marathon, a 40-second 1 km), never a slow athlete.
   */
  min_value: number;
  max_value: number;
  /** Erg marks: the exact monitor distance. Run time trials: the GPS/belt distance. */
  target_distance_m?: number;
  /** Cooper: the fixed effort duration. The VALUE is the distance covered. */
  fixed_duration_s?: number;
  /** Erg marks: which machine the PM5 must be. */
  erg?: 'row' | 'ski';
  /**
   * The race twin: canonical 16-slot station index in `races.station_splits_json`
   * (stations sit on the even slots — SkiErg 2, RowErg 10). Only the marks that ARE
   * a race station carry one; it powers "en el box vs en carrera".
   */
  race_station_index?: number;
  /** "~4 min" — the pitch that makes it feel doable. */
  approx_label: string;
}

// ── The catalog ──────────────────────────────────────────────────────────────────

const seconds = BENCHMARK_UNIT_SECONDS;
const meters = BENCHMARK_UNIT_METERS;

/** The six self-testable marks + the three registrable race distances. */
export const MARKS: readonly MarkSpec[] = [
  // Correr — GPS outdoors, FTMS belt on the treadmill. HR rides along from the band.
  {
    slug: BENCH_RUN_1K,
    label: benchmarkLabel(BENCH_RUN_1K),
    group: 'run',
    measured_by: 'run',
    unit: seconds,
    lower_is_better: true,
    min_value: 120, // 2:00 — faster than the world record, reject
    max_value: 1200, // 20:00 — walking it still counts
    target_distance_m: 1000,
    approx_label: '~4-5 min',
  },
  {
    slug: BENCH_COOPER_12MIN,
    label: benchmarkLabel(BENCH_COOPER_12MIN),
    group: 'run',
    measured_by: 'run',
    unit: meters,
    lower_is_better: false, // the one mark where MORE is better
    min_value: 1000,
    max_value: 6000, // beyond world-class, reject
    fixed_duration_s: 720,
    approx_label: '12 min justos',
  },
  {
    slug: BENCH_RUN_5K,
    label: benchmarkLabel(BENCH_RUN_5K),
    group: 'run',
    measured_by: 'run',
    unit: seconds,
    lower_is_better: true,
    min_value: 720, // 12:00
    max_value: 4500, // 75:00
    target_distance_m: 5000,
    approx_label: '~25 min',
  },
  // Ergo — the PM5 measures everything over BLE; nothing is typed.
  {
    slug: BENCH_ROW_500M,
    label: benchmarkLabel(BENCH_ROW_500M),
    group: 'ergo',
    measured_by: 'erg',
    unit: seconds,
    lower_is_better: true,
    min_value: 70, // 1:10
    max_value: 300, // 5:00
    target_distance_m: 500,
    erg: 'row',
    approx_label: '~2 min',
  },
  {
    slug: BENCH_ROW_1K,
    label: benchmarkLabel(BENCH_ROW_1K),
    group: 'ergo',
    measured_by: 'erg',
    unit: seconds,
    lower_is_better: true,
    min_value: 150, // 2:30
    max_value: 600, // 10:00
    target_distance_m: 1000,
    erg: 'row',
    race_station_index: 10, // RowErg is the 5th station → slot 10 of 16
    approx_label: '~4 min · como en HYROX',
  },
  {
    slug: BENCH_SKI_1K,
    label: benchmarkLabel(BENCH_SKI_1K),
    group: 'ergo',
    measured_by: 'erg',
    unit: seconds,
    lower_is_better: true,
    min_value: 160,
    max_value: 600,
    target_distance_m: 1000,
    erg: 'ski',
    race_station_index: 2, // SkiErg opens the race → slot 2 of 16
    approx_label: '~4 min · como en HYROX',
  },
  // Carreras — not measured by the app: registered after the fact.
  {
    slug: BENCH_RUN_10K,
    label: benchmarkLabel(BENCH_RUN_10K),
    group: 'race',
    measured_by: 'registered',
    unit: seconds,
    lower_is_better: true,
    min_value: 1500, // 25:00
    max_value: 9000, // 2h30
    target_distance_m: 10000,
    approx_label: 'Apúntala cuando la corras',
  },
  {
    slug: BENCH_RUN_HALF,
    label: benchmarkLabel(BENCH_RUN_HALF),
    group: 'race',
    measured_by: 'registered',
    unit: seconds,
    lower_is_better: true,
    min_value: 3300, // 55:00
    max_value: 16200, // 4h30
    target_distance_m: 21097,
    approx_label: 'Apúntala cuando la corras',
  },
  {
    slug: BENCH_RUN_MARATHON,
    label: benchmarkLabel(BENCH_RUN_MARATHON),
    group: 'race',
    measured_by: 'registered',
    unit: seconds,
    lower_is_better: true,
    min_value: 6900, // 1h55
    max_value: 30000, // 8h20
    target_distance_m: 42195,
    approx_label: 'Apúntala cuando la corras',
  },
];

// ── Lookups ──────────────────────────────────────────────────────────────────────

const BY_SLUG = new Map(MARKS.map((m) => [m.slug, m]));

export function markBySlug(slug: string): MarkSpec | null {
  return BY_SLUG.get(slug) ?? null;
}

/** The marks "Probarme" offers — the app can measure these end to end. */
export function selfTestableMarks(): MarkSpec[] {
  return MARKS.filter((m) => m.measured_by !== 'registered');
}

/** The race distances "Registrar" offers. */
export function registrableMarks(): MarkSpec[] {
  return MARKS.filter((m) => m.measured_by === 'registered');
}

// ── Validation ───────────────────────────────────────────────────────────────────

export type MarkValueError = 'unknown_mark' | 'not_finite' | 'below_min' | 'above_max';

/**
 * Sanity-check a value for a mark. The bounds reject impossible numbers, never slow
 * ones — a rejected genuine effort erodes trust faster than a stored typo.
 */
export function validateMarkValue(
  slug: string,
  value: number,
): { ok: true; spec: MarkSpec } | { ok: false; error: MarkValueError } {
  const spec = markBySlug(slug);
  if (!spec) return { ok: false, error: 'unknown_mark' };
  if (!Number.isFinite(value)) return { ok: false, error: 'not_finite' };
  if (value < spec.min_value) return { ok: false, error: 'below_min' };
  if (value > spec.max_value) return { ok: false, error: 'above_max' };
  return { ok: true, spec };
}

/**
 * Is `value` a personal best against `history`? Run marks compare WITHIN their
 * context — a treadmill 5K never beats a street 5K (the belt helps), so each context
 * keeps its own PR. Non-run marks pass context = null on both sides.
 */
export function isPersonalBest(
  spec: MarkSpec,
  value: number,
  history: readonly { value: number; run_context?: string | null }[],
  run_context: RunContext | null = null,
): boolean {
  const comparable = history.filter((h) =>
    spec.group === 'run' ? (h.run_context ?? null) === run_context : true,
  );
  if (comparable.length === 0) return true;
  return spec.lower_is_better
    ? comparable.every((h) => value < h.value)
    : comparable.every((h) => value > h.value);
}

/**
 * Las marcas de las que se puede leer un VDOT, sacadas del catálogo cerrado.
 *
 * Vive aquí y no en cada lector porque ya la derivaban DOS sitios por su cuenta
 * (`athlete/analytics/running.ts` y la lectura de progreso), y dos filtros
 * distintos sobre el mismo catálogo son dos VDOT distintos para el mismo
 * atleta: el nivel que enseña una pantalla dejaría de ser el que usa la otra.
 */
export const RUN_MARK_SLUGS: readonly string[] = MARKS.filter(
  (m) => m.group === 'run' || m.group === 'race',
).map((m) => m.slug);
