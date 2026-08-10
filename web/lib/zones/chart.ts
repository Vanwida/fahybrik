// TIEMPO EN ZONAS — la aritmética y las palabras de la gráfica, sin React.
//
// Todo lo que esta pantalla puede equivocar es cuenta: qué semanas faltan, cuánto
// mide una barra, dónde empieza un tramo del plan, cómo se dice «seis horas y
// treinta y cinco minutos». Vive aquí, suelto del dibujo, porque así se prueba
// con un test de verdad en vez de mirando la pantalla. El componente sólo escribe
// lo que este módulo decide.
//
// LA REGLA QUE MANDA SOBRE TODAS: una semana sin dato NO es un cero. El motor la
// deja fuera de `weeks` a propósito (ver lib/zones/weekly.ts) y aquí vuelve como
// una celda con `week: null`. Un cero dice «no entrenó» y el hueco dice «no
// sabemos», y el coach hace cosas distintas ante cada uno.
//
// NO lleva 'server-only': lo importa el navegador.

import type { SegmentModality } from '@/lib/sync/ingest-execution-segments';
import type { WeeklyZoneWeek } from '@/lib/zones/weekly';
import type { PlanPathSegmentDTO } from '@fahybrid/shared/domain/plan-path';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const HOUR_S = 3600;

// ── LA VENTANA ────────────────────────────────────────────────────────────────

export type ZoneWindowKey = '3m' | '6m' | '12m';

export interface ZoneWindow {
  value: ZoneWindowKey;
  label: string;
  weeks: number;
}

/**
 * Las tres ventanas que ofrece la gráfica. Viven aquí y no en el motor porque es
 * la PANTALLA la que decide cuánto pasado se lee de un vistazo; el motor sirve
 * lo que le pidan y sólo necesita saber qué pedir cuando nadie pide nada, y eso
 * lo saca de aquí (`WEEKLY_ZONES_DEFAULT_WEEKS`). Un solo sitio, así que cambiar
 * el defecto de la pantalla no deja la API sirviendo otra cosa.
 */
export const ZONE_WINDOWS: readonly ZoneWindow[] = [
  { value: '3m', label: '3 meses', weeks: 13 },
  { value: '6m', label: '6 meses', weeks: 26 },
  { value: '12m', label: '1 año', weeks: 52 },
];

export const DEFAULT_ZONE_WINDOW: ZoneWindowKey = '6m';

export function zoneWindowWeeks(key: ZoneWindowKey): number {
  return ZONE_WINDOWS.find((w) => w.value === key)?.weeks ?? 26;
}

// ── LAS ZONAS Y EL HUECO ──────────────────────────────────────────────────────

export const ZONE_KEYS = ['z1', 'z2', 'z3', 'z4', 'z5'] as const;
export type ZoneKey = (typeof ZONE_KEYS)[number];

/** Las cinco zonas más el tiempo que no se pudo repartir, de abajo arriba. */
export const ZONE_PART_KEYS = [...ZONE_KEYS, 'no_hr'] as const;
export type ZonePartKey = (typeof ZONE_PART_KEYS)[number];

/**
 * Cómo se llama cada banda para un entrenador. «Sin zona» y no «sin pulso»: a
 * escala de semana caben los dos motivos (el entreno no trajo pulso, o lo trajo
 * pero el atleta no tiene umbral) y los dos significan lo mismo aquí, que ese
 * tiempo no se puede repartir. El motivo se dice aparte, en palabras.
 */
export const ZONE_PART_LABEL: Record<ZonePartKey, string> = {
  z1: 'Z1 suave',
  z2: 'Z2 base',
  z3: 'Z3 tempo',
  z4: 'Z4 umbral',
  z5: 'Z5 máximo',
  no_hr: 'Sin zona',
};

/**
 * El color de cada banda. Es la escala de FRECUENCIA CARDIACA del sistema
 * (`--z1..--z5` en globals.css), la misma del aro del reloj. La otra escala del
 * repo (`--v2-z1..--v2-z6`) es de RITMO y tiene seis bandas con el verde en otro
 * sitio: mezclarlas haría que «verde» dijera recuperación en una pantalla y
 * tempo en la de al lado.
 */
export const ZONE_PART_COLOR_VAR: Record<ZoneKey, string> = {
  z1: '--z1',
  z2: '--z2',
  z3: '--z3',
  z4: '--z4',
  z5: '--z5',
};

// ── EL FILTRO POR TIPO DE ENTRENO ─────────────────────────────────────────────

/**
 * El vocabulario del contrato, rotulado. Es un `Record` a propósito: el día que
 * el motor gane una modalidad, esto deja de compilar hasta que alguien decida
 * cómo se llama en castellano, en vez de enseñarla sin nombre.
 */
export const ZONE_MODALITY_LABEL: Record<SegmentModality, string> = {
  run: 'Correr',
  row: 'Remo',
  ski: 'Ski',
  bike: 'Bici',
  strength: 'Fuerza',
  other: 'Otro',
};

/** En qué orden se ofrecen. Un test comprueba que no falta ninguna. */
export const ZONE_MODALITY_ORDER: readonly SegmentModality[] = [
  'run',
  'row',
  'ski',
  'bike',
  'strength',
  'other',
];

// ── FECHAS ────────────────────────────────────────────────────────────────────

/** El lunes de la semana de una fecha ISO. Aritmética en UTC: las semanas ya
 *  vienen calculadas en la zona del atleta y aquí sólo se cuentan. */
export function mondayOf(iso: string): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  const backDays = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - backDays * DAY_MS).toISOString().slice(0, 10);
}

export function addWeeks(iso: string, weeks: number): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return new Date(t + weeks * WEEK_MS).toISOString().slice(0, 10);
}

function weeksBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / WEEK_MS);
}

// ── EL EJE DE SEMANAS, CON SUS HUECOS ─────────────────────────────────────────

export interface ZoneWeekCell {
  /** Lunes de la semana, ISO. */
  week_start: string;
  /** null = de esta semana no sabemos nada. Nunca es un cero. */
  week: WeeklyZoneWeek | null;
}

/**
 * La rejilla de semanas de la ventana, con las que faltan dentro como huecos.
 *
 * El eje llega hasta la semana de hoy aunque no haya nada que pintar en ella (un
 * eje que se parara en el último entreno escondería justo la ausencia reciente,
 * que es la que importa), y se estira hacia atrás si el motor devolvió una semana
 * anterior al arranque nominal de la ventana: ningún dato servido se cae del
 * dibujo por un redondeo de calendario.
 */
export function buildWeekCells(args: {
  weeks: readonly WeeklyZoneWeek[];
  windowWeeks: number;
  /** Hoy, «YYYY-MM-DD». Se inyecta para que el test no dependa del reloj. */
  todayIso: string;
}): ZoneWeekCell[] {
  const byWeek = new Map<string, WeeklyZoneWeek>();
  for (const w of args.weeks) byWeek.set(mondayOf(w.week_start), w);
  const known = [...byWeek.keys()].sort();

  const today = mondayOf(args.todayIso);
  const newest = known[known.length - 1];
  const last = newest !== undefined && newest > today ? newest : today;

  const span = Math.max(1, Math.trunc(args.windowWeeks));
  let first = addWeeks(last, -(span - 1));
  const oldest = known[0];
  if (oldest !== undefined && oldest < first) first = oldest;

  const count = Math.max(1, weeksBetween(first, last) + 1);
  const cells: ZoneWeekCell[] = [];
  for (let i = 0; i < count; i++) {
    const iso = addWeeks(first, i);
    cells.push({ week_start: iso, week: byWeek.get(iso) ?? null });
  }
  return cells;
}

// ── LA PILA DE UNA BARRA ──────────────────────────────────────────────────────

export interface ZoneStackPart {
  key: ZonePartKey;
  seconds: number;
  /** Segundos acumulados bajo esta banda: su borde de abajo dentro de la pila. */
  from: number;
  /** Y su borde de arriba. El dibujo lee estos dos y no acumula por su cuenta. */
  to: number;
}

/**
 * Las bandas de una semana, de abajo arriba y con las vacías fuera. El orden es
 * FIJO (Z1 abajo, el hueco arriba) porque una pila que se reordena por tamaño no
 * se puede comparar de una semana a la siguiente, que es para lo único que sirve
 * esta gráfica.
 *
 * Cada banda llega con su tramo ya acumulado: el componente pinta rectángulos y
 * no lleva la cuenta, que es donde se cuelan los desfases de un píxel.
 */
export function stackOf(week: WeeklyZoneWeek): ZoneStackPart[] {
  const parts: ZoneStackPart[] = [];
  let acc = 0;
  for (const key of ZONE_PART_KEYS) {
    const seconds = partSeconds(week, key);
    if (seconds <= 0) continue;
    parts.push({ key, seconds, from: acc, to: acc + seconds });
    acc += seconds;
  }
  return parts;
}

function partSeconds(week: WeeklyZoneWeek, key: ZonePartKey): number {
  const raw = key === 'no_hr' ? week.no_hr_s : week[`${key}_s`];
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * El alto de una barra. Se suma de sus bandas y NO se lee de `total_s`: si el
 * motor sumara distinto, la barra y su rótulo dirían dos cosas a la vez sobre la
 * misma pantalla. Lo que se dibuja es lo que se rotula, siempre.
 */
export function weekTotal(week: WeeklyZoneWeek): number {
  let total = 0;
  for (const key of ZONE_PART_KEYS) total += partSeconds(week, key);
  return total;
}

// ── LOS TOTALES DE LA VENTANA ─────────────────────────────────────────────────

export interface ZoneTotals {
  parts: Record<ZonePartKey, number>;
  total: number;
  weeksWithData: number;
  weeksWithoutData: number;
  /** Cuánto del tiempo medido no se pudo repartir, de 0 a 1. */
  sinZonaShare: number;
  /** El total de la semana más alta. Es el techo del eje. */
  maxWeek: number;
}

export function zoneTotals(cells: readonly ZoneWeekCell[]): ZoneTotals {
  const parts = Object.fromEntries(ZONE_PART_KEYS.map((k) => [k, 0])) as Record<
    ZonePartKey,
    number
  >;
  let total = 0;
  let maxWeek = 0;
  let weeksWithData = 0;

  for (const cell of cells) {
    if (!cell.week) continue;
    weeksWithData++;
    const weekSum = weekTotal(cell.week);
    if (weekSum > maxWeek) maxWeek = weekSum;
    total += weekSum;
    for (const key of ZONE_PART_KEYS) parts[key] += partSeconds(cell.week, key);
  }

  return {
    parts,
    total,
    weeksWithData,
    weeksWithoutData: cells.length - weeksWithData,
    sinZonaShare: total > 0 ? parts.no_hr / total : 0,
    maxWeek,
  };
}

// ── EL EJE Y ──────────────────────────────────────────────────────────────────

/** Los escalones de rejilla, del cuarto de hora a los dos días. */
const TICK_STEPS_S = [
  15 * 60,
  30 * 60,
  HOUR_S,
  2 * HOUR_S,
  3 * HOUR_S,
  4 * HOUR_S,
  6 * HOUR_S,
  8 * HOUR_S,
  12 * HOUR_S,
  24 * HOUR_S,
  48 * HOUR_S,
];

/** Cuántos huecos entre marcas como mucho: cinco líneas contando el cero. */
const MAX_TICK_INTERVALS = 4;

export interface ZoneScale {
  /** El techo del eje, en segundos. */
  max: number;
  /** Dónde van las líneas de rejilla, en segundos. La primera es el cero. */
  ticks: number[];
}

/**
 * La escala vertical. El techo es la semana más alta y no un número redondo por
 * encima: así la barra más alta llega al borde y la comparación entre semanas usa
 * todo el alto disponible. Las marcas caen en horas limpias por debajo.
 */
export function zoneScale(maxSeconds: number): ZoneScale {
  const max = Math.max(1, maxSeconds);
  const step =
    TICK_STEPS_S.find((s) => Math.floor(max / s) <= MAX_TICK_INTERVALS) ??
    TICK_STEPS_S[TICK_STEPS_S.length - 1]!;
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  return { max, ticks };
}

// ── EL ANCHO ──────────────────────────────────────────────────────────────────

/** Márgenes del dibujo: la izquierda es el sitio de las marcas del eje Y. */
export const CHART_PAD_L = 46;
export const CHART_PAD_R = 10;

/** Lo que ocupa una semana. Por debajo del mínimo la gráfica scrollea; por
 *  encima del máximo las barras quedarían sueltas, cada una en su descampado. */
const SLOT_MIN = 34;
const SLOT_MAX = 64;
/** La barra nunca llena su hueco: el aire es lo que separa una semana de otra. */
const BAR_MAX = 24;
const BAR_MIN = 9;
const BAR_AIR = 12;

export interface ChartLayout {
  /** Ancho de una semana. */
  slot: number;
  /** Ancho de la barra dentro de ese hueco. */
  barW: number;
  /** Ancho total del SVG. Mayor que el contenedor = scrollea dentro de él. */
  width: number;
}

/**
 * Cuánto mide cada semana en pantalla. La gráfica llena el ancho que le dan
 * mientras las semanas se lean, scrollea cuando ya no caben, y deja de estirarse
 * cuando estirarse más sería separar cuatro barras a lo largo de un monitor.
 *
 * `boxW` a 0 (primer pintado, servidor) cae al mínimo: se dibuja la versión
 * estrecha y la medida real la corrige en el mismo frame.
 */
export function chartLayout(boxW: number, cellCount: number): ChartLayout {
  const n = Math.max(1, cellCount);
  const available = Math.max(0, boxW - CHART_PAD_L - CHART_PAD_R);
  const raw = available > 0 ? available / n : 0;
  const slot = Math.min(SLOT_MAX, Math.max(SLOT_MIN, raw));
  const barW = Math.max(BAR_MIN, Math.min(BAR_MAX, slot - BAR_AIR));
  return { slot, barW, width: CHART_PAD_L + slot * n + CHART_PAD_R };
}

// ── LOS TRAMOS DEL PLAN, TUMBADOS BAJO EL EJE ─────────────────────────────────

export interface ZonePlanBand {
  key: string;
  title: string;
  detail: string | null;
  weeks_label: string;
  /** Tono por POSICIÓN en el plan (`planPathTone`), ya resuelto por el motor. */
  tone: number;
  /** Rompe la rutina: lleva un simulacro o unos tests. */
  milestone: boolean;
  /** Hoy cae dentro de este tramo. */
  current: boolean;
  /** Índice de la primera y la última celda que ocupa, ambas inclusive. */
  from: number;
  to: number;
}

/**
 * Los tramos del plan alineados con las semanas de arriba. Un tramo que no pisa
 * la ventana no se dibuja, y el que la pisa a medias se recorta: la banda es un
 * eje, no un resumen del plan entero.
 */
export function planBands(
  cells: readonly ZoneWeekCell[],
  segments: readonly PlanPathSegmentDTO[],
): ZonePlanBand[] {
  if (cells.length === 0) return [];
  const bands: ZonePlanBand[] = [];

  for (const seg of segments) {
    let from = -1;
    let to = -1;
    for (let i = 0; i < cells.length; i++) {
      const cellStart = cells[i]!.week_start;
      const cellEnd = addWeeks(cellStart, 1);
      // El domingo de la celda es el día anterior al lunes siguiente, así que se
      // compara con `<` contra ese lunes en vez de fabricar la fecha del domingo.
      if (seg.start_date < cellEnd && seg.end_date >= cellStart) {
        if (from === -1) from = i;
        to = i;
      }
    }
    if (from === -1) continue;
    bands.push({
      key: seg.assignment_id,
      title: seg.title,
      detail: seg.detail,
      weeks_label: seg.weeks_label,
      tone: seg.tone,
      milestone: seg.milestone,
      current: seg.current_week != null,
      from,
      to,
    });
  }

  return bands;
}

// ── PALABRAS ──────────────────────────────────────────────────────────────────

/**
 * Una duración como la diría un entrenador: «6h 35m», «45m», «2h». El cero es
 * «0» a secas, que es lo que va en la base del eje.
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s === 0) return '0';
  const h = Math.floor(s / HOUR_S);
  const m = Math.round((s - h * HOUR_S) / 60);
  // 59m40s redondea a 60m, y eso es una hora, no «0h 60m».
  if (m === 60) return `${h + 1}h`;
  if (h === 0) return m === 0 ? '<1m' : `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const WEEK_SHORT_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const WEEK_LONG_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** «12 may» — la marca del eje X. */
export function formatWeekShort(iso: string): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? WEEK_SHORT_FMT.format(new Date(t)) : iso;
}

/** «12 de mayo» — para leerlo en voz alta. */
export function formatWeekLong(iso: string): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? WEEK_LONG_FMT.format(new Date(t)) : iso;
}

/**
 * Cada cuántas celdas se rotula el eje X. Veintiséis fechas seguidas no se leen:
 * se rotula una de cada tantas y el resto lo cuenta el detalle de cada barra.
 */
export function tickStride(cellCount: number, maxLabels = 8): number {
  return Math.max(1, Math.ceil(cellCount / Math.max(1, maxLabels)));
}

/**
 * El desglose de una semana en una frase. Es a la vez el rótulo accesible de la
 * barra y lo que sale al pasar por encima: quien no ve la pantalla oye lo mismo
 * que quien la ve.
 */
export function weekBreakdown(cell: ZoneWeekCell): string {
  const when = `Semana del ${formatWeekLong(cell.week_start)}`;
  if (!cell.week) return `${when}: sin datos`;
  const parts = stackOf(cell.week);
  const total = formatDuration(weekTotal(cell.week));
  if (parts.length === 0) return `${when}: sin datos`;
  const detail = parts
    .map((p) => `${ZONE_PART_LABEL[p.key]} ${formatDuration(p.seconds)}`)
    .join(', ');
  return `${when}: ${total} en total. ${detail}`;
}

/** «3 semanas sin dato» / «1 semana sin dato». Vacío cuando no falta ninguna. */
export function missingWeeksPhrase(count: number): string {
  if (count <= 0) return '';
  return count === 1 ? '1 semana sin dato' : `${count} semanas sin dato`;
}
