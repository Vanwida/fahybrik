// Datos y formateadores de «Tus marcas» — ESPEJO, cero invención.
//
// El catálogo (9 marcas, en este orden) es el cerrado de
// shared/domain/athlete/marks.ts; los derivados (mejor marca, última, mejor por
// contexto) se calculan como pickBest en web/lib/athlete/marks.ts; y el formato
// de valores, ritmos, antigüedad y deltas es el enum MarkFormat de
// ios/FAHYBRIK/Marks/MarksService.swift, coma por coma.
//
// La antigüedad se guarda en DÍAS y no en fechas ISO a propósito: el doble tiene
// que reproducir el mismo guion dentro de seis meses, y una fecha fija iría
// envejeciendo hasta pintar «hace 8 meses» donde el guion dice «hace 12 días».

export type MarkGroup = 'run' | 'ergo' | 'race';
export type MarkMeasuredBy = 'run' | 'erg' | 'registered';
export type MarkUnit = 'seconds' | 'meters';
export type RunContext = 'outdoor' | 'treadmill';
export type MarkSource = 'coach_test' | 'athlete_test' | 'registered' | 'onboarding';

export interface MarkResult {
  value: number;
  daysAgo: number;
  source: MarkSource;
  runContext?: RunContext;
  eventName?: string;
}

export interface RaceTwin {
  seconds: number;
  raceName: string;
}

export interface Mark {
  slug: string;
  label: string;
  group: MarkGroup;
  measuredBy: MarkMeasuredBy;
  unit: MarkUnit;
  lowerIsBetter: boolean;
  approxLabel: string;
  targetDistanceM?: number;
  fixedDurationS?: number;
  erg?: 'row' | 'ski';
  /** Nueva → vieja, como la sirve el backend. */
  history: MarkResult[];
  raceTwin?: RaceTwin;
}

type MarkSpec = Omit<Mark, 'history' | 'raceTwin'>;

// ── El catálogo cerrado (shared/domain/athlete/marks.ts) ─────────────────────

const CATALOGO: readonly MarkSpec[] = [
  {
    slug: 'run_1k',
    label: '1 km a tope',
    group: 'run',
    measuredBy: 'run',
    unit: 'seconds',
    lowerIsBetter: true,
    approxLabel: '~4-5 min',
    targetDistanceM: 1000,
  },
  {
    slug: 'cooper_12min',
    label: 'Cooper 12 min',
    group: 'run',
    measuredBy: 'run',
    unit: 'meters',
    lowerIsBetter: false,
    approxLabel: '12 min justos',
    fixedDurationS: 720,
  },
  {
    slug: 'run_5k',
    label: 'Carrera 5 km',
    group: 'run',
    measuredBy: 'run',
    unit: 'seconds',
    lowerIsBetter: true,
    approxLabel: '~25 min',
    targetDistanceM: 5000,
  },
  {
    slug: 'row_500m',
    label: 'Remo 500 m',
    group: 'ergo',
    measuredBy: 'erg',
    unit: 'seconds',
    lowerIsBetter: true,
    approxLabel: '~2 min',
    targetDistanceM: 500,
    erg: 'row',
  },
  {
    slug: 'row_1k',
    label: 'Remo 1000 m',
    group: 'ergo',
    measuredBy: 'erg',
    unit: 'seconds',
    lowerIsBetter: true,
    approxLabel: '~4 min · como en HYROX',
    targetDistanceM: 1000,
    erg: 'row',
  },
  {
    slug: 'ski_1k',
    label: 'SkiErg 1000 m',
    group: 'ergo',
    measuredBy: 'erg',
    unit: 'seconds',
    lowerIsBetter: true,
    approxLabel: '~4 min · como en HYROX',
    targetDistanceM: 1000,
    erg: 'ski',
  },
  {
    slug: 'run_10k',
    label: 'Carrera 10 km',
    group: 'race',
    measuredBy: 'registered',
    unit: 'seconds',
    lowerIsBetter: true,
    approxLabel: 'Apúntala cuando la corras',
    targetDistanceM: 10000,
  },
  {
    slug: 'run_half',
    label: 'Media maratón',
    group: 'race',
    measuredBy: 'registered',
    unit: 'seconds',
    lowerIsBetter: true,
    approxLabel: 'Apúntala cuando la corras',
    targetDistanceM: 21097,
  },
  {
    slug: 'run_marathon',
    label: 'Maratón',
    group: 'race',
    measuredBy: 'registered',
    unit: 'seconds',
    lowerIsBetter: true,
    approxLabel: 'Apúntala cuando la corras',
    targetDistanceM: 42195,
  },
];

// ── Los dos guiones ──────────────────────────────────────────────────────────
//
// Un atleta coherente consigo mismo: el 1 km a 3:52 sostiene el 5 km a 4:15/km y
// el 10 km a 4:33/km, y el remo de 500 (1:52/500) sostiene el de 1000 (1:58/500).
// Solo las marcas que SON estación de carrera (remo y ski de 1000 m) tienen
// gemelo de carrera — es la regla de race_station_index, no una elección.

interface Historia {
  history: MarkResult[];
  raceTwin?: RaceTwin;
}

const CON_HISTORIAL = new Map<string, Historia>([
  [
    'run_1k',
    {
      history: [
        { value: 232, daysAgo: 9, source: 'athlete_test', runContext: 'outdoor' },
        { value: 236, daysAgo: 31, source: 'athlete_test', runContext: 'treadmill' },
        { value: 241, daysAgo: 68, source: 'coach_test', runContext: 'outdoor' },
        { value: 245, daysAgo: 150, source: 'onboarding', runContext: 'outdoor' },
      ],
    },
  ],
  [
    'cooper_12min',
    {
      history: [
        { value: 2870, daysAgo: 33, source: 'coach_test', runContext: 'outdoor' },
        { value: 2740, daysAgo: 150, source: 'onboarding', runContext: 'outdoor' },
      ],
    },
  ],
  [
    'run_5k',
    {
      history: [
        { value: 1275, daysAgo: 61, source: 'athlete_test', runContext: 'outdoor' },
        { value: 1322, daysAgo: 150, source: 'onboarding', runContext: 'outdoor' },
      ],
    },
  ],
  [
    'row_500m',
    {
      history: [
        { value: 112.4, daysAgo: 12, source: 'athlete_test' },
        { value: 115, daysAgo: 40, source: 'coach_test' },
        { value: 117.8, daysAgo: 75, source: 'athlete_test' },
        { value: 116, daysAgo: 150, source: 'onboarding' },
      ],
    },
  ],
  [
    'row_1k',
    {
      history: [
        { value: 235, daysAgo: 20, source: 'coach_test' },
        { value: 242, daysAgo: 95, source: 'athlete_test' },
      ],
      raceTwin: { seconds: 258, raceName: 'HYROX Barcelona' },
    },
  ],
  [
    'ski_1k',
    {
      history: [{ value: 244, daysAgo: 44, source: 'athlete_test' }],
      raceTwin: { seconds: 262, raceName: 'HYROX Barcelona' },
    },
  ],
  [
    'run_10k',
    {
      history: [
        { value: 2730, daysAgo: 118, source: 'registered', eventName: 'Cursa dels Nassos' },
      ],
    },
  ],
]);

function construir(historias: Map<string, Historia>): Mark[] {
  return CATALOGO.map((spec) => {
    const h = historias.get(spec.slug);
    return { ...spec, history: h?.history ?? [], raceTwin: h?.raceTwin };
  });
}

/** Un atleta con recorrido: PR, deltas y gemelo de carrera donde toca. */
export const MARCAS_CON_HISTORIAL: readonly Mark[] = construir(CON_HISTORIAL);
/** Alguien que aún no se ha probado: todo el catálogo en vacío. */
export const MARCAS_SIN_DATOS: readonly Mark[] = construir(new Map());
/** El coach no ha publicado ninguna prueba: `marks.isEmpty` en MarksLibraryView. */
export const CATALOGO_VACIO: readonly Mark[] = [];

// ── Derivados (pickBest de web/lib/athlete/marks.ts) ─────────────────────────

/** Mejor valor comparable. Con `context`, SOLO los resultados de ese contexto. */
export function best(mark: Mark, context?: RunContext): MarkResult | null {
  const pool =
    context === undefined ? mark.history : mark.history.filter((h) => (h.runContext ?? null) === context);
  if (pool.length === 0) return null;
  return pool.reduce((acc, h) =>
    mark.lowerIsBetter ? (h.value < acc.value ? h : acc) : h.value > acc.value ? h : acc,
  );
}

/** El resultado más reciente — el backend sirve el historial nueva → vieja. */
export function latest(mark: Mark): MarkResult | null {
  return mark.history[0] ?? null;
}

// ── Formato (enum MarkFormat, MarksService.swift) ────────────────────────────

/** 232 → «3:52»; 3725 → «1:02:05». Redondea a segundos enteros, como el Swift. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** El valor en su forma de pantalla: tiempo o metros. */
export function markValue(mark: Mark, value: number): string {
  if (mark.unit === 'meters') return `${Math.round(value)} m`;
  return clock(value);
}

/** El ritmo derivado bajo el valor: correr → /km, ergo → /500. */
export function paceLine(mark: Mark, value: number): string | null {
  if (mark.unit !== 'seconds') return null;
  const dist = mark.targetDistanceM;
  if (!dist || dist <= 0) return null;
  if (mark.group === 'ergo') return `${clock((value * 500) / dist)}/500`;
  return `${clock((value * 1000) / dist)}/km`;
}

/**
 * DataOrigin.label(source, eventName) — la única grafía de un origen, coma por
 * coma. Antes cada vista tenía su propio switch y el mismo origen acababa con
 * dos nombres («test del coach» en la biblioteca, «test con tu coach» en el
 * detalle); esto es el formateador único, espejo de ios/FAHYBRIK/Shared/DataOrigin.swift.
 */
export function originLabel(source: MarkSource, eventName?: string): string | null {
  switch (source) {
    case 'coach_test':
      return 'test del coach';
    case 'athlete_test':
      return 'te probaste';
    case 'onboarding':
      return 'lo dijiste tú';
    case 'registered':
      return eventName ?? 'carrera registrada';
    default:
      return null;
  }
}

/** «hace 3 semanas» — antigüedad gruesa a propósito. */
export function relative(daysAgo: number): string {
  const days = Math.max(0, Math.floor(daysAgo));
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 14) return `hace ${days} días`;
  if (days < 60) return `hace ${Math.floor(days / 7)} semanas`;
  return `hace ${Math.floor(days / 30)} meses`;
}

/** Delta con signo frente al anterior, orientado para que verde = mejor. */
export function delta(
  mark: Mark,
  from: number,
  to: number,
): { label: string; improved: boolean } | null {
  const diff = to - from;
  if (Math.abs(diff) < 0.5) return null;
  const improved = mark.lowerIsBetter ? diff < 0 : diff > 0;
  const signo = diff > 0 ? '+' : '−';
  const unidad = mark.unit === 'meters' ? 'm' : 's';
  return { label: `${signo}${Math.round(Math.abs(diff))} ${unidad}`, improved };
}
