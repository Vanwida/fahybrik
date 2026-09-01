// POR TIPO DE ENTRENO — ¿mejoras en lo que entrenas?
//
// Del mapa (docs/analiticas-running-mapa.md, NIVEL 1, v2): «Series → todos tus
// 6×800 en el tiempo → ¿voy más rápido en series?». El eje es el PROPÓSITO de
// la sesión, no la superficie.
//
// LOS SEIS CÓDIGOS SON LOS MISMOS QUE `correr-historial/modelo.ts` (TIPO_LABEL_FILTRO):
// misma clasificación vista desde dos ángulos — la lista cruda de salidas allí,
// la progresión dentro de un tipo aquí. Si alguna vez divergen, ESE es el bug.
// 'cinta' se queda fuera a propósito: allí es un dato más de la fila (dónde se
// corrió); aquí NO es un tipo de pleno derecho porque una serie corrida en
// cinta sigue siendo una serie — lo que cambia es la superficie, no el
// propósito del entreno, y mezclar los dos ejes rompería la propia pregunta
// «¿voy más rápido en series?» (dejaría fuera las series corridas en cinta).
export type TipoPorEntreno = 'series' | 'rodaje' | 'largo' | 'fartlek' | 'cuesta' | 'tempo';

export const ORDEN_TIPOS: TipoPorEntreno[] = ['series', 'rodaje', 'largo', 'fartlek', 'cuesta', 'tempo'];

/** Voz del chip — plural, como ya lo dice `correr-historial` (TIPO_LABEL_FILTRO). */
export const TIPO_LABEL: Record<TipoPorEntreno, string> = {
  series: 'Series',
  rodaje: 'Rodajes',
  largo: 'Largos',
  fartlek: 'Fartlek',
  cuesta: 'Cuestas',
  tempo: 'Tempo',
};

/** La pregunta que trae al atleta a este tipo — el sujeto de la pantalla, en
 *  segunda persona como el resto de la app («Vas mejor», nunca «voy mejor»). */
export const PREGUNTA_DE: Record<TipoPorEntreno, string> = {
  series: '¿Vas más rápido en series?',
  rodaje: '¿Mejoras en tus rodajes?',
  largo: '¿Mejoras en tus tiradas largas?',
  fartlek: '¿Mejoras en fartlek?',
  cuesta: '¿Mejoras en cuestas?',
  tempo: '¿Vas más rápido a tempo?',
};

/**
 * QUÉ SE COMPARA EN LA LÍNEA DE PROGRESIÓN — y es del TIPO, no del atleta.
 *
 * Series, cuestas y tempo persiguen un RITMO OBJETIVO: comparar el ritmo bruto
 * tiene sentido porque el objetivo ya es un ritmo. Rodajes, largos y fartlek
 * son ESFUERZO LIBRE: un rodaje corrido más rápido no es "mejor", es otro día
 * —viento, sueño, compañía—, así que la única comparación honesta es el ritmo
 * AL MISMO PULSO. Es la misma idea que «Forma» ya usa en el hub para toda la
 * práctica junta (`h.al_pulso`), aplicada aquí tipo a tipo.
 */
export type Metrica = 'ritmo' | 'ritmo_al_pulso';

export const METRICA_DE: Record<TipoPorEntreno, Metrica> = {
  series: 'ritmo',
  cuesta: 'ritmo',
  tempo: 'ritmo',
  rodaje: 'ritmo_al_pulso',
  largo: 'ritmo_al_pulso',
  fartlek: 'ritmo_al_pulso',
};

/** Sesiones mínimas para que la progresión SE DIBUJE (Alex, 13-ago: la línea
 *  con 2 puntos es una conclusión inventada). Por debajo, se listan las
 *  sesiones sueltas y una frase — nunca una línea. */
export const MIN_SESIONES_PROGRESION = 3;

/** Repeticiones evaluadas mínimas para que el % en banda se pueda JUZGAR (y
 *  llevar color) — el mismo concepto que `Pedido.juzgable` en progress.ts,
 *  aplicado por tipo en vez de a toda la práctica de una vez. */
export const MIN_REPS_JUZGABLE = 8;

/** El corte de color del % en banda — mismo valor que el defecto del coach
 *  (`good_in_band_pct`, shared/domain/coach/running-thresholds.ts). */
export const BUENA_ADHERENCIA_PCT = 80;

// ---------------------------------------------------------------------------
// LOS DATOS DE UNA SESIÓN Y DE UN TIPO
// ---------------------------------------------------------------------------

export interface SesionTipo {
  /** ISO YYYY-MM-DD. */
  fecha: string;
  /** «6×800», «50 min suave», «16 km» — lo que la nombra. */
  dosis: string;
  ritmo_s_km: number;
  /** Ritmo a la FC de referencia del atleta. Null = esa sesión no tenía pulso
   *  con el que ajustar (sin banda, sin reloj esa vez). */
  ritmo_al_pulso_s_km: number | null;
  fc_media_ppm: number | null;
  /** % de esta sesión en banda. Null = no era una sesión prescrita con banda. */
  pct_en_banda: number | null;
}

export interface Adherencia {
  evaluadas: number;
  dentro: number;
  fuera_lento: number;
  fuera_rapido: number;
  pct_en_banda: number;
  juzgable: boolean;
}

export interface EstadoTipo {
  tipo: TipoPorEntreno;
  /** Orden ascendente por fecha. */
  sesiones: SesionTipo[];
  /** Null = ninguna sesión de este tipo llevó nunca una banda que cumplir —
   *  un tipo hecho siempre libre no lleva adherencia (regla de Alex). */
  adherencia: Adherencia | null;
}

export interface PuntoProgreso {
  fecha: string;
  valor: number;
}

function valorDe(s: SesionTipo, m: Metrica): number | null {
  return m === 'ritmo' ? s.ritmo_s_km : s.ritmo_al_pulso_s_km;
}

/** La progresión, o null si no llega al mínimo — nunca una línea de 2 puntos. */
export function progresionDe(e: EstadoTipo): PuntoProgreso[] | null {
  const m = METRICA_DE[e.tipo];
  const puntos = e.sesiones
    .map((s) => ({ fecha: s.fecha, valor: valorDe(s, m) }))
    .filter((p): p is PuntoProgreso => p.valor != null);
  return puntos.length >= MIN_SESIONES_PROGRESION ? puntos : null;
}

export interface DeltaTipo {
  /** Positivo = ha mejorado (el ritmo, o el ritmo al pulso, ha bajado). */
  gana_s_km: number;
  /** El titular: media de la ventana final — lo que se enseña como cifra grande. */
  medio_ultimas_s_km: number;
  /** Tamaño de cada mitad comparada (1, 2 o 3 — nunca solapan). */
  ventana: number;
}

/**
 * Ventana simétrica SIN SOLAPE: 3 sesiones → 1 vs 1; 4-5 → 2 vs 2; 6+ → 3 vs 3
 * (la comparación que pide Alex: «las 3 últimas contra las 3 primeras»). Con
 * menos de 3 sesiones no hay progresión que sostenerlo (ver `progresionDe`).
 */
export function deltaDe(e: EstadoTipo): DeltaTipo | null {
  const puntos = progresionDe(e);
  if (!puntos) return null;
  const ventana = Math.min(3, Math.floor(puntos.length / 2));
  const media = (xs: PuntoProgreso[]) => xs.reduce((a, x) => a + x.valor, 0) / xs.length;
  const primeras = media(puntos.slice(0, ventana));
  const ultimas = media(puntos.slice(-ventana));
  return { gana_s_km: Math.round(primeras - ultimas), medio_ultimas_s_km: Math.round(ultimas), ventana };
}

/**
 * La más rápida en ritmo bruto — «mejor sesión» en el sentido llano, incluso
 * en un tipo de esfuerzo libre: la salida más rápida es la que el atleta
 * recuerda. La progresión de arriba, en cambio, usa la métrica ajustada
 * (`METRICA_DE`) porque contesta una pregunta distinta: no «cuál fue tu mejor
 * día», sino «vas mejorando».
 */
export function mejorSesionDe(e: EstadoTipo): SesionTipo | null {
  if (e.sesiones.length === 0) return null;
  return [...e.sesiones].sort((a, b) => a.ritmo_s_km - b.ritmo_s_km)[0]!;
}

// ---------------------------------------------------------------------------
// FECHA — el día y el mes cortos viven en el kit desde el 13-ago (§2.1); esta
// pantalla los escribió locales mientras el kit estaba bloqueado y se
// promovieron el mismo día. `epochDias` se queda: es aritmética del eje de la
// progresión, no un formateador.
// ---------------------------------------------------------------------------

export { diaCorto, mesCorto } from '../../kit-composicion/formato';

function partes(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

export function epochDias(iso: string): number {
  const { y, m, d } = partes(iso);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
