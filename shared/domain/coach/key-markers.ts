// @fahybrid/shared/domain/coach/key-markers — los MARCADORES CLAVE que el coach
// quiere ver de un vistazo en la ficha de cada atleta (columna «Estado»).
//
// Qué marcadores mira un coach es MÉTODO (HARD RULE Nº0): uno de fuerza mira la
// sentadilla y el peso muerto, otro de resistencia el 5 km y el remo 2 km. El
// producto trae un CATÁLOGO cerrado (lo que sabemos medir y leer: un 1RM, un
// test cronometrado, la FC máxima) y cada coach elige los suyos
// (`coach_key_markers`, mig 0233). Sin elegir nada ve los cuatro por defecto —
// los mismos que la ficha pintaba cableados hasta el 23-sep-2026.
//
// Puro: sin base de datos.

import {
  BENCH_BACK_SQUAT_1RM,
  BENCH_BENCH_PRESS_1RM,
  BENCH_CLEAN_1RM,
  BENCH_DEADLIFT_1RM,
  BENCH_FTP,
  BENCH_HRR_60,
  BENCH_HYROX_OPEN,
  BENCH_HYROX_PRO,
  BENCH_LTHR,
  BENCH_OHP_1RM,
  BENCH_ROW_2K,
  BENCH_ROW_500M,
  BENCH_RUN_10K,
  BENCH_RUN_1K,
  BENCH_RUN_5K,
  BENCH_RUN_THRESHOLD,
  BENCH_SKI_1K,
  BENCH_SNATCH_1RM,
  BENCH_STRICT_PULL_UP_MAX,
} from './benchmark-slugs';

/** De dónde sale el valor de un marcador. */
export type KeyMarkerSource =
  /** Último 1RM versionado (`athlete_strength_maxes`). */
  | { kind: 'strength'; slug: string }
  /** Último resultado de test (`athlete_benchmarks`). */
  | { kind: 'benchmark'; slug: string }
  /** FC máxima medida del atleta (`athletes.max_hr_bpm`). */
  | { kind: 'max_hr' };

export type KeyMarkerUnit = 'kg' | 'time' | 'pace_km' | 'bpm' | 'watts' | 'reps';

export interface KeyMarkerDef {
  key: string;
  label: string;
  unit: KeyMarkerUnit;
  source: KeyMarkerSource;
  /** Menor es mejor (tiempos, ritmos). */
  lower_is_better: boolean;
}

const strength = (key: string, label: string): KeyMarkerDef => ({
  key,
  label,
  unit: 'kg',
  source: { kind: 'strength', slug: key },
  lower_is_better: false,
});
const timed = (key: string, label: string): KeyMarkerDef => ({
  key,
  label,
  unit: 'time',
  source: { kind: 'benchmark', slug: key },
  lower_is_better: true,
});

/** Lo que el producto sabe medir y leer. El orden es el del selector. */
export const KEY_MARKER_CATALOG: readonly KeyMarkerDef[] = [
  strength(BENCH_BACK_SQUAT_1RM, 'Sentadilla 1RM'),
  strength(BENCH_DEADLIFT_1RM, 'Peso muerto 1RM'),
  strength(BENCH_BENCH_PRESS_1RM, 'Press banca 1RM'),
  strength(BENCH_OHP_1RM, 'Press militar 1RM'),
  strength(BENCH_CLEAN_1RM, 'Cargada 1RM'),
  strength(BENCH_SNATCH_1RM, 'Arrancada 1RM'),
  { key: 'max_hr', label: 'FC máx', unit: 'bpm', source: { kind: 'max_hr' }, lower_is_better: false },
  {
    key: BENCH_LTHR,
    label: 'Umbral de pulso',
    unit: 'bpm',
    source: { kind: 'benchmark', slug: BENCH_LTHR },
    lower_is_better: false,
  },
  {
    key: BENCH_HRR_60,
    label: 'Recuperación FC 60 s',
    unit: 'bpm',
    source: { kind: 'benchmark', slug: BENCH_HRR_60 },
    lower_is_better: false,
  },
  timed(BENCH_RUN_1K, '1 km'),
  timed(BENCH_RUN_5K, '5 km'),
  timed(BENCH_RUN_10K, '10 km'),
  {
    key: BENCH_RUN_THRESHOLD,
    label: 'Umbral carrera',
    unit: 'pace_km',
    source: { kind: 'benchmark', slug: BENCH_RUN_THRESHOLD },
    lower_is_better: true,
  },
  timed(BENCH_ROW_500M, 'Remo 500 m'),
  timed(BENCH_ROW_2K, 'Remo 2 km'),
  timed(BENCH_SKI_1K, 'SkiErg 1 km'),
  {
    key: BENCH_FTP,
    label: 'Umbral de potencia',
    unit: 'watts',
    source: { kind: 'benchmark', slug: BENCH_FTP },
    lower_is_better: false,
  },
  {
    key: BENCH_STRICT_PULL_UP_MAX,
    label: 'Dominadas estrictas',
    unit: 'reps',
    source: { kind: 'benchmark', slug: BENCH_STRICT_PULL_UP_MAX },
    lower_is_better: false,
  },
  timed(BENCH_HYROX_OPEN, 'HYROX Open'),
  timed(BENCH_HYROX_PRO, 'HYROX Pro'),
];

const BY_KEY = new Map(KEY_MARKER_CATALOG.map((d) => [d.key, d]));

/** Defecto del producto (un coach que no elige ve estos). */
export const DEFAULT_KEY_MARKERS: readonly string[] = [
  BENCH_BACK_SQUAT_1RM,
  BENCH_DEADLIFT_1RM,
  'max_hr',
  BENCH_RUN_5K,
];

/** Cuántos caben en la columna sin que deje de ser un vistazo. */
export const KEY_MARKERS_MAX = 6;

export function keyMarkerDef(key: string): KeyMarkerDef | null {
  return BY_KEY.get(key) ?? null;
}

export function isKeyMarkerKey(key: string): boolean {
  return BY_KEY.has(key);
}

/**
 * Lo guardado por el coach (en orden) → los marcadores efectivos. Sin filas =
 * el defecto. Las claves que el catálogo ya no conoce se ignoran.
 */
export function resolveKeyMarkers(saved: ReadonlyArray<string>): KeyMarkerDef[] {
  const known = saved.map((k) => BY_KEY.get(k)).filter((d): d is KeyMarkerDef => d != null);
  const list = known.length > 0 ? known : DEFAULT_KEY_MARKERS.map((k) => BY_KEY.get(k)!);
  return list.slice(0, KEY_MARKERS_MAX);
}

function clock(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** «110 kg», «19:40», «4:05 /km», «186 ppm», «250 W», «12 reps». */
export function formatKeyMarkerValue(unit: KeyMarkerUnit, value: number): string {
  switch (unit) {
    case 'kg':
      return `${Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')} kg`;
    case 'time':
      return clock(value);
    case 'pace_km':
      return `${clock(value)} /km`;
    case 'bpm':
      return `${Math.round(value)} ppm`;
    case 'watts':
      return `${Math.round(value)} W`;
    case 'reps':
      return `${Math.round(value)} reps`;
  }
}
