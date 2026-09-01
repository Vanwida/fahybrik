// EL HISTORIAL DE CARRERAS — modelo puro: tipos, fecha, agrupación semanal y
// agregados de periodo. Sin JSX y sin escenarios: eso vive en `datos.ts` y en
// `piezas.tsx`. La separación es la misma que ya usa `analiticas-correr`.

// ---------------------------------------------------------------------------
// EL TIPO DE SESIÓN — el eje del filtro (mapa v2, sección HISTORIAL)
// ---------------------------------------------------------------------------

export type TipoRun = 'series' | 'rodaje' | 'largo' | 'fartlek' | 'cuesta' | 'tempo' | 'cinta';

export const ORDEN_TIPOS: TipoRun[] = ['series', 'rodaje', 'largo', 'fartlek', 'cuesta', 'tempo', 'cinta'];

/** La voz de la fila: singular («RODAJE»). */
export const TIPO_LABEL: Record<TipoRun, string> = {
  series: 'Series',
  rodaje: 'Rodaje',
  largo: 'Largo',
  fartlek: 'Fartlek',
  cuesta: 'Cuesta',
  tempo: 'Tempo',
  cinta: 'Cinta',
};

/** La voz del filtro: plural («Rodajes») donde el plural existe. */
export const TIPO_LABEL_FILTRO: Record<TipoRun, string> = {
  ...TIPO_LABEL,
  rodaje: 'Rodajes',
  largo: 'Largos',
  cuesta: 'Cuestas',
};

// ---------------------------------------------------------------------------
// LA FILA — una salida ya cerrada
// ---------------------------------------------------------------------------

export interface CarreraFila {
  /** ISO YYYY-MM-DD. */
  fecha: string;
  tipo: TipoRun;
  /** «6×800» — ausente en un rodaje o un largo sin estructura que nombrar. */
  nombre?: string;
  km: number;
  ritmoSKm: number;
  fcMedia?: number;
  desnivelM?: number;
  origen: 'coach' | 'garmin';
  /**
   * Solo cuando `origen === 'coach'`: una importada de Garmin no lleva
   * veredicto porque nadie le pidió nada (§7, honestidad del dato).
   */
  veredicto?: 'ok' | 'aviso';
  /** Batió una marca en esta sesión. */
  record?: boolean;
}

// ---------------------------------------------------------------------------
// EL PERIODO — ventanas móviles desde HOY, no mes de calendario
// ---------------------------------------------------------------------------
//
// «Mes» como mes de calendario se rompe a media obra: a día 13 solo caben dos
// semanas. Una ventana móvil de 30 días da siempre las últimas cuatro semanas
// completas, sea cual sea el día del mes en que el atleta mire — el mismo
// criterio que Strava y Garmin usan para «últimas 4 semanas».

export type Periodo = '7d' | 'mes' | 'anio' | 'todo';

export const PERIODO_LABEL: Record<Periodo, string> = {
  '7d': '7 d',
  mes: 'Mes',
  anio: 'Año',
  todo: 'Todo',
};

export const OPCIONES_PERIODO: { valor: Periodo; etiqueta: string }[] = (
  ['7d', 'mes', 'anio', 'todo'] as Periodo[]
).map((valor) => ({ valor, etiqueta: PERIODO_LABEL[valor] }));

const VENTANA_DIAS: Record<Exclude<Periodo, 'todo'>, number> = {
  '7d': 7,
  mes: 30,
  anio: 365,
};

// ---------------------------------------------------------------------------
// FECHA — aritmética sobre el string ISO, sin que el huso horario del
// navegador decida en qué día cae una carrera
// ---------------------------------------------------------------------------

function partes(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

function epochDias(iso: string): number {
  const { y, m, d } = partes(iso);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function diffDias(desde: string, hasta: string): number {
  return epochDias(hasta) - epochDias(desde);
}

function sumaDias(iso: string, n: number): string {
  const { y, m, d } = partes(iso);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** 1=lunes … 7=domingo (getUTCDay da 0=domingo). */
function diaSemanaISO(iso: string): number {
  const { y, m, d } = partes(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** El lunes de la semana ISO que contiene `iso`. */
export function lunesDe(iso: string): string {
  return sumaDias(iso, -(diaSemanaISO(iso) - 1));
}

// La fecha corta y el tiempo agregado viven en el kit desde el 13-ago (§2.1):
// esta pantalla los escribió locales mientras el kit estaba bloqueado y se
// promovieron el mismo día. El re-export mantiene estable el import de piezas.
export { diaCorto, fechaCorta, horasYMin } from '../../kit-composicion/formato';

export function dentroDelPeriodo(fecha: string, periodo: Periodo, hoy: string): boolean {
  if (periodo === 'todo') return true;
  return diffDias(fecha, hoy) < VENTANA_DIAS[periodo];
}

// ---------------------------------------------------------------------------
// AGREGADOS — el sujeto de arriba, siempre recalculado sobre lo visible
// ---------------------------------------------------------------------------

export interface Agregado {
  km: number;
  salidas: number;
  segundos: number;
  desnivelM: number;
}

export function agregadoDe(filas: CarreraFila[]): Agregado {
  return filas.reduce(
    (a, f) => ({
      km: a.km + f.km,
      salidas: a.salidas + 1,
      segundos: a.segundos + f.km * f.ritmoSKm,
      desnivelM: a.desnivelM + (f.desnivelM ?? 0),
    }),
    { km: 0, salidas: 0, segundos: 0, desnivelM: 0 },
  );
}

// ---------------------------------------------------------------------------
// AGRUPACIÓN POR SEMANA — como Garmin: lunes primero, semana más reciente arriba
// ---------------------------------------------------------------------------

export interface GrupoSemana {
  lunes: string;
  km: number;
  filas: CarreraFila[];
}

export function agruparPorSemana(filas: CarreraFila[]): GrupoSemana[] {
  const porLunes = new Map<string, CarreraFila[]>();
  for (const f of filas) {
    const l = lunesDe(f.fecha);
    const arr = porLunes.get(l);
    if (arr) arr.push(f);
    else porLunes.set(l, [f]);
  }
  return [...porLunes.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([lunes, fs]) => ({
      lunes,
      km: fs.reduce((s, f) => s + f.km, 0),
      filas: [...fs].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    }));
}
