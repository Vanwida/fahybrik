// EL MODELO — informes de running por métrica y periodo (docs/analiticas-running-mapa.md,
// NIVEL 1 · TENDENCIAS). Es lo que Garmin llama Reports: km/semana, tiempo, ritmo, FC,
// desnivel, VO₂máx, cadencia — cada uno con su cifra del periodo y su serie debajo.
//
// PROPUESTA, no espejo: TENDENCIAS es ❌ ENTERA en el mapa (no hay endpoint ni motor en el
// servidor todavía), así que a diferencia de `analiticas-correr` (que reexporta el motor de
// `shared/domain/running/progress.ts`) aquí el modelo entero vive en este fichero. El día que
// se construya el endpoint real, la forma de abajo —semana → cifra del periodo + serie— es la
// que tiene que servir.
//
// UNA SEMANA ES LA UNIDAD ATÓMICA. Todo lo demás —el total de un periodo, la barra de un mes,
// el delta contra el periodo anterior— se AGREGA desde aquí con una sola función (`agregar`),
// nunca se inventa por separado: así un total de 6 meses no puede discrepar de la suma de sus
// seis barras, porque son la misma cuenta.
//
// LOS DATOS SON INVENTADOS PERO CONSISTENTES: un generador determinista (semilla fija, sin
// `Date.now()` ni `Math.random()`) construye semana a semana en vez de escribir 48+20+5 filas a
// mano, que es como se cuelan totales que no cuadran con sus propias barras.

import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';

// ---------------------------------------------------------------------------
// TIPOS
// ---------------------------------------------------------------------------

export type PeriodoId = '4sem' | '6meses' | 'anio' | 'todo';

export const PERIODOS: { id: PeriodoId; etiqueta: string }[] = [
  { id: '4sem', etiqueta: '4 sem' },
  { id: '6meses', etiqueta: '6 meses' },
  { id: 'anio', etiqueta: 'Año' },
  { id: 'todo', etiqueta: 'Todo' },
];

/**
 * Una semana de entreno. `kmRodajes` / `tiempoRodajesS` solo existen cuando el escenario
 * SEPARA la fuente por tipo de sesión (histórico con detalle) — su ausencia (no un 0) es lo
 * que apaga la variante «solo rodajes» del bloque de ritmo (§7: lo que no se sabe no se pinta).
 */
export interface SemanaTendencia {
  /** Lunes ISO de la semana — la clave, como en `analiticas-correr`. */
  lunesISO: string;
  km: number;
  tiempoS: number;
  /** Subconjunto de `km`/`tiempoS` que fueron rodajes, cuando la fuente los distingue. */
  kmRodajes?: number;
  tiempoRodajesS?: number;
  /** Si esa semana incluyó una sesión de series/intervalos — gobierna la nota del ritmo. */
  tuvoSeries: boolean;
  fcMedia?: number;
  desnivelM: number;
  vo2max?: number;
  cadenciaPasosMin?: number;
}

/** El resultado de agregar N semanas — un bucket (una barra, un punto) o un periodo entero. */
export interface Agregado {
  km: number | null;
  tiempoS: number | null;
  desnivelM: number | null;
  /** s/km, media ponderada por tiempo de TODAS las carreras. */
  ritmo: number | null;
  /** s/km, media ponderada SOLO de rodajes — null si la fuente no los separa. */
  ritmoRodajes: number | null;
  fcMedia: number | null;
  /** Última lectura de la ventana (instrumento, no se suma ni se promedia). */
  vo2: number | null;
  cadencia: number | null;
  tuvoSeries: boolean;
}

export type CampoMetrica = Exclude<keyof Agregado, 'tuvoSeries'>;

export interface Bucket extends Agregado {
  etiqueta: string;
}

/** Lo que pinta un bloque: la cifra del periodo, la del periodo anterior (o null: sin
 *  comparación posible, §7) y la serie de puntos que dibuja el gráfico. */
export interface Bloque {
  actual: number | null;
  anterior: number | null;
  puntos: { etiqueta: string; valor: number }[];
}

// ---------------------------------------------------------------------------
// «HOY» — fijo, como las ocho semanas de `analiticas-correr/datos.ts`
// ---------------------------------------------------------------------------

const HOY = parseIsoDate('2026-08-13');
const LUNES_ACTUAL = mondayOfWeek(HOY);

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

function mesIndice(lunesISO: string): number {
  const d = parseIsoDate(lunesISO);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** «ago» · «sep 25» — el año solo aparece cuando el bucket no es del año en curso, que es
 *  exactamente cuándo hace falta para no confundir dos septiembres del mismo informe. */
function etiquetaMes(indice: number): string {
  const anio = Math.floor(indice / 12);
  const mes = ((indice % 12) + 12) % 12;
  return anio !== HOY.getUTCFullYear() ? `${MES_CORTO[mes]} ${String(anio).slice(2)}` : MES_CORTO[mes]!;
}

/** «4 ago» — la semana se identifica por el día de su lunes, como hace Garmin en sus Reports. */
function etiquetaSemana(lunesISO: string): string {
  const d = parseIsoDate(lunesISO);
  return `${d.getUTCDate()} ${MES_CORTO[d.getUTCMonth()]}`;
}

// ---------------------------------------------------------------------------
// EL GENERADOR — determinista, sin `Math.random`, para que el mockup no cambie entre renders
// ---------------------------------------------------------------------------

/** mulberry32: PRNG determinista de una sola línea de estado, sembrado a mano. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ConfigGenerador {
  seed: number;
  numSemanas: number;
  kmInicio: number;
  kmFin: number;
  /** s/km, la media COMBINADA (todas las sesiones) al principio y al final de la ventana. */
  ritmoInicioSKm: number;
  ritmoFinSKm: number;
  fcInicio: number;
  fcFin: number;
  desnivelMedio: number;
  /** 0..1 — probabilidad de que una semana dada incluya una sesión de series. */
  pctSemanasConSeries: number;
  /** Si la fuente distingue series de rodajes (histórico con detalle de sesión). */
  separaRodajes: boolean;
  vo2Inicio?: number;
  vo2Fin?: number;
  /** Cada cuántas semanas hay una lectura nueva (el reloj no recalcula cada semana). */
  vo2CadaSemanas?: number;
  conCadencia: boolean;
  cadenciaInicio?: number;
  cadenciaFin?: number;
}

/**
 * Construye la serie semana a semana en vez de escribirla a mano: con hasta 48 filas por
 * escenario y siete campos cada una, tipear los números es donde se cuelan los que no cuadran
 * (un total que no suma sus propias barras). El ritmo de cada semana SALE de su km y su tiempo
 * —nunca al revés— así que agregarlos después nunca puede discrepar de la cifra semanal.
 */
function generarSemanas(cfg: ConfigGenerador): SemanaTendencia[] {
  const rnd = mulberry32(cfg.seed);
  const semanas: SemanaTendencia[] = [];

  for (let i = 0; i < cfg.numSemanas; i++) {
    const t = cfg.numSemanas > 1 ? i / (cfg.numSemanas - 1) : 1;
    const lunesISO = isoDateString(addDays(LUNES_ACTUAL, -7 * (cfg.numSemanas - 1 - i)));

    const km = Math.max(0, Math.round((cfg.kmInicio + (cfg.kmFin - cfg.kmInicio) * t + (rnd() - 0.5) * 6) * 10) / 10);
    const ritmoBase = cfg.ritmoInicioSKm + (cfg.ritmoFinSKm - cfg.ritmoInicioSKm) * t + (rnd() - 0.5) * 10;

    const tuvoSeries = rnd() < cfg.pctSemanasConSeries;
    // Las series ACELERAN la media combinada: unos segundos por km más rápido que la semana
    // sin ellas. Es justo lo que la nota del bloque de ritmo tiene que advertir.
    const ritmoSemana = tuvoSeries ? ritmoBase - (8 + rnd() * 8) : ritmoBase;
    const tiempoS = Math.max(0, Math.round(km * ritmoSemana));

    let kmRodajes: number | undefined;
    let tiempoRodajesS: number | undefined;
    if (cfg.separaRodajes) {
      // Una sesión de series ocupa aprox. un cuarto del volumen semanal; el resto son rodajes
      // al ritmo «base» (sin el acelerón de la serie). Sin series, la semana ES rodajes.
      kmRodajes = tuvoSeries ? Math.round(km * 0.72 * 10) / 10 : km;
      tiempoRodajesS = tuvoSeries ? Math.round(kmRodajes * ritmoBase) : tiempoS;
    }

    const fcMedia = Math.round(cfg.fcInicio + (cfg.fcFin - cfg.fcInicio) * t + (rnd() - 0.5) * 6);
    const desnivelM = Math.max(10, Math.round(cfg.desnivelMedio + (rnd() - 0.5) * cfg.desnivelMedio * 0.9));

    const leeVo2 = cfg.vo2Inicio != null && cfg.vo2Fin != null && cfg.vo2CadaSemanas != null;
    const vo2max =
      leeVo2 && (i % cfg.vo2CadaSemanas! === 0 || i === cfg.numSemanas - 1)
        ? Math.round(cfg.vo2Inicio! + (cfg.vo2Fin! - cfg.vo2Inicio!) * t)
        : undefined;

    const cadenciaPasosMin = cfg.conCadencia
      ? Math.round(cfg.cadenciaInicio! + (cfg.cadenciaFin! - cfg.cadenciaInicio!) * t + (rnd() - 0.5) * 3)
      : undefined;

    semanas.push({ lunesISO, km, tiempoS, kmRodajes, tiempoRodajesS, tuvoSeries, fcMedia, desnivelM, vo2max, cadenciaPasosMin });
  }

  return semanas;
}

// ---------------------------------------------------------------------------
// LOS TRES ATLETAS — cada uno rompe la pantalla por un sitio distinto (mismo criterio que
// `analiticas-correr/datos.ts`: si los tres entran sin un hueco relleno, el diseño aguanta)
// ---------------------------------------------------------------------------

/**
 * ① Un año dentro, con histórico importado: las siete métricas existen. Series unas semanas
 * sí y otras no (`separaRodajes`), así que enseña el bloque de ritmo con su nota Y su
 * alternancia «solo rodajes» completas.
 */
const ANO_COMPLETO: SemanaTendencia[] = generarSemanas({
  seed: 1001,
  numSemanas: 48,
  kmInicio: 34,
  kmFin: 48,
  ritmoInicioSKm: 320,
  ritmoFinSKm: 293,
  fcInicio: 154,
  fcFin: 148,
  desnivelMedio: 95,
  pctSemanasConSeries: 0.55,
  separaRodajes: true,
  vo2Inicio: 46,
  vo2Fin: 53,
  vo2CadaSemanas: 3,
  conCadencia: true,
  cadenciaInicio: 167,
  cadenciaFin: 176,
});

/**
 * ② Un mes y pico dentro (20 semanas): hay VO₂máx (el reloj lo estima solo, sin import) pero
 * NO cadencia (esa sí necesita el histórico de Garmin). Hay series algunas semanas, así que la
 * nota del ritmo aparece — pero la fuente no separa rodajes, así que no hay alternancia: es el
 * caso «nota sin variante», distinto del ① y del ③.
 */
const MES_A_MES: SemanaTendencia[] = generarSemanas({
  seed: 2002,
  numSemanas: 20,
  kmInicio: 27,
  kmFin: 39,
  ritmoInicioSKm: 312,
  ritmoFinSKm: 300,
  fcInicio: 150,
  fcFin: 146,
  desnivelMedio: 70,
  pctSemanasConSeries: 0.4,
  separaRodajes: false,
  vo2Inicio: 45,
  vo2Fin: 47,
  vo2CadaSemanas: 4,
  conCadencia: false,
});

/**
 * ③ Cinco semanas de historial en la app — no cinco semanas corriendo: un atleta que ya
 * rodaba 30-40 km/semana y acaba de empezar con este coach. Por eso el volumen ya es de
 * amateur serio y lo que falta es justo lo que tarda en construirse — VO₂máx estable y
 * cadencia importada —, no la forma física. Sin series todavía (el coach no las ha metido en
 * cinco semanas de base), así que el bloque de ritmo no lleva nota: no hay nada que advertir.
 */
const POCO_HISTORICO: SemanaTendencia[] = generarSemanas({
  seed: 3003,
  numSemanas: 5,
  kmInicio: 34,
  kmFin: 40,
  ritmoInicioSKm: 305,
  ritmoFinSKm: 300,
  fcInicio: 150,
  fcFin: 149,
  desnivelMedio: 60,
  pctSemanasConSeries: 0,
  separaRodajes: false,
  conCadencia: false,
});

export const ESCENAS: Record<string, SemanaTendencia[]> = {
  'ano-completo': ANO_COMPLETO,
  'mes-a-mes': MES_A_MES,
  'poco-historico': POCO_HISTORICO,
};

// ---------------------------------------------------------------------------
// LA AGREGACIÓN — una sola función, reusada para una barra, un mes y un periodo entero
// ---------------------------------------------------------------------------

function suma<T>(xs: T[], f: (x: T) => number): number {
  return xs.reduce((acc, x) => acc + f(x), 0);
}

/**
 * Vacío ≠ cero. Si no hay ni una semana real en la ventana (el atleta no existía todavía),
 * el resultado es null en TODO — un volumen en 0 diría «entrenaste cero», y lo que pasa es
 * que no hay dato, que es la distinción que manda el §7 del CONTRATO-UI.
 */
function agregar(semanas: SemanaTendencia[]): Agregado {
  if (semanas.length === 0) {
    return { km: null, tiempoS: null, desnivelM: null, ritmo: null, ritmoRodajes: null, fcMedia: null, vo2: null, cadencia: null, tuvoSeries: false };
  }

  const km = suma(semanas, (s) => s.km);
  const tiempoS = suma(semanas, (s) => s.tiempoS);
  const desnivelM = suma(semanas, (s) => s.desnivelM);
  // Ponderado por tiempo real, no la media de las medias semanales: una semana de 60 km no
  // puede pesar lo mismo que una de 20 en el ritmo del periodo.
  const ritmo = km > 0 ? tiempoS / km : null;

  const conRodajes = semanas.filter((s) => s.kmRodajes != null && s.tiempoRodajesS != null);
  const kmRodajes = suma(conRodajes, (s) => s.kmRodajes!);
  const tiempoRodajes = suma(conRodajes, (s) => s.tiempoRodajesS!);
  const ritmoRodajes = conRodajes.length > 0 && kmRodajes > 0 ? tiempoRodajes / kmRodajes : null;

  const conFc = semanas.filter((s) => s.fcMedia != null);
  const fcMedia = conFc.length > 0 ? suma(conFc, (s) => s.fcMedia! * s.tiempoS) / suma(conFc, (s) => s.tiempoS) : null;

  const conCadencia = semanas.filter((s) => s.cadenciaPasosMin != null);
  const cadencia =
    conCadencia.length > 0 ? suma(conCadencia, (s) => s.cadenciaPasosMin! * s.tiempoS) / suma(conCadencia, (s) => s.tiempoS) : null;

  // El VO₂máx es un instrumento, no un caudal: la lectura que vale es la ÚLTIMA de la
  // ventana, no la suma ni la media de las que hubo.
  const conVo2 = semanas.filter((s) => s.vo2max != null);
  const vo2 = conVo2.length > 0 ? conVo2[conVo2.length - 1]!.vo2max! : null;

  const tuvoSeries = semanas.some((s) => s.tuvoSeries);

  return { km, tiempoS, desnivelM, ritmo, ritmoRodajes, fcMedia, vo2, cadencia, tuvoSeries };
}

/** Las semanas de un periodo, o las del periodo INMEDIATAMENTE ANTERIOR (mismo largo). */
export function ventanaDe(semanas: SemanaTendencia[], periodo: PeriodoId, cual: 'actual' | 'anterior'): SemanaTendencia[] {
  if (periodo === '4sem') {
    const n = semanas.length;
    if (cual === 'actual') return semanas.slice(Math.max(0, n - 4), n);
    // La anterior SOLO cuenta si son 4 semanas reales y completas: comparar 4 contra 1 (lo
    // que hay justo antes de que el atleta empezara) infla el delta por artefacto, no por
    // progreso — exactamente lo que el atleta de ③ (5 semanas) tendría que sufrir sin esto.
    if (n < 8) return [];
    return semanas.slice(n - 8, n - 4);
  }

  if (periodo === 'todo') return cual === 'actual' ? semanas : [];

  const meses = periodo === '6meses' ? 6 : 12;
  const mesActual = mesIndice(isoDateString(LUNES_ACTUAL));
  const [lo, hi] = cual === 'actual' ? [mesActual - meses + 1, mesActual] : [mesActual - 2 * meses + 1, mesActual - meses];
  return semanas.filter((s) => {
    const idx = mesIndice(s.lunesISO);
    return idx >= lo && idx <= hi;
  });
}

/**
 * Las barras/puntos de un periodo: una por semana (4 sem) o una por mes calendario (el resto).
 * «Según periodo» es literal — no se decide por cuánto historial haya, así que un atleta con
 * cinco semanas que elige «Año» ve dos barras cortas, no doce con diez vacías (§7).
 */
function bucketsDe(semanas: SemanaTendencia[], periodo: PeriodoId): Bucket[] {
  const ventana = ventanaDe(semanas, periodo, 'actual');

  if (periodo === '4sem') {
    return ventana.map((s) => ({ etiqueta: etiquetaSemana(s.lunesISO), ...agregar([s]) }));
  }

  const grupos = new Map<number, SemanaTendencia[]>();
  for (const s of ventana) {
    const idx = mesIndice(s.lunesISO);
    grupos.set(idx, [...(grupos.get(idx) ?? []), s]);
  }
  return [...grupos.keys()].sort((a, b) => a - b).map((idx) => ({ etiqueta: etiquetaMes(idx), ...agregar(grupos.get(idx)!) }));
}

/** El bloque completo de una métrica: la cifra del periodo, la del anterior y su serie. */
export function bloqueDe(semanas: SemanaTendencia[], periodo: PeriodoId, campo: CampoMetrica): Bloque {
  const actual = agregar(ventanaDe(semanas, periodo, 'actual'));
  const anterior = agregar(ventanaDe(semanas, periodo, 'anterior'));
  const puntos = bucketsDe(semanas, periodo)
    .map((b) => ({ etiqueta: b.etiqueta, valor: b[campo] }))
    .filter((p): p is { etiqueta: string; valor: number } => p.valor != null);

  return { actual: actual[campo], anterior: anterior[campo], puntos };
}

/** El último bucket visible — para nombrar a qué sesiones aterriza el toque del bloque. */
export function ultimoBucket(semanas: SemanaTendencia[], periodo: PeriodoId): Bucket | null {
  const buckets = bucketsDe(semanas, periodo);
  return buckets.length > 0 ? buckets[buckets.length - 1]! : null;
}

// ---------------------------------------------------------------------------
// CAPACIDADES DEL ESCENARIO — de qué fuentes dispone, derivado de los datos y no de una
// bandera aparte que pudiera discrepar de ellos
// ---------------------------------------------------------------------------

export function tieneVo2(semanas: SemanaTendencia[]): boolean {
  return semanas.some((s) => s.vo2max != null);
}

export function tieneCadencia(semanas: SemanaTendencia[]): boolean {
  return semanas.some((s) => s.cadenciaPasosMin != null);
}

export function separaRodajesDe(semanas: SemanaTendencia[]): boolean {
  return semanas.some((s) => s.kmRodajes != null);
}

/** Si la ventana visible incluyó alguna semana con series — gobierna la nota del ritmo. */
export function huboSeriesEnVentana(semanas: SemanaTendencia[], periodo: PeriodoId): boolean {
  return ventanaDe(semanas, periodo, 'actual').some((s) => s.tuvoSeries);
}
