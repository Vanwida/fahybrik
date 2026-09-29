// ¿MEJORO? — UNA regla para todas las familias (docs/analiticas/modelo.md §3
// fila 5, A3, A9 y A10).
//
// LA REGLA
// --------
// Cada familia tiene su métrica clave (el Motor al correr, el 1RM estimado del
// levantamiento principal, el tiempo de una estación a la misma dosis…). Lo que
// NO cambia de una familia a otra es cómo se juzga:
//
//   1. la métrica en la ventana, contra la MISMA métrica en la ventana anterior
//      de igual longitud (A3/A4);
//   2. el delta en la unidad del umbral del coach que lo juzga — correr en s/km
//      (`meaningful_gain_s_per_km`), el resto en % (`cambio_*_pct`, 0279). Es lo
//      que arregla P1: un delta nunca se juzga contra un umbral de otra unidad;
//   3. la palabra solo si hay evidencia en los DOS periodos (un mínimo por
//      periodo que es mecanismo: 1 para un mejor, que es un hecho; 3 para una
//      media, `MIN_TRAMOS_POR_MITAD`), y hacia dónde es mejor lo dice el
//      SENTIDO de la métrica: en un ritmo, bajar; en un 1RM, subir.
//
// LOS CUATRO ESTADOS (A10), resueltos aquí y no en cada familia:
//   vacío       la familia no tiene NINGUNA observación → sin dato. Quien nunca
//               ha remado no tiene nada que mejorar en remo: se calla
//               (`ocasion`). Quien aún no ha entrenado nada, sí: se le dibuja el
//               plazo (`historia`).
//   poco dato   hay número en la ventana pero no con qué compararlo → el número
//               se queda y la palabra se retira con su por qué.
//   lleno       número, comparación y palabra.
//   dato viejo  nada en la ventana, algo antes → el último número que hubo, con
//               su fecha (`viejo`), sin comparación ni palabra.
//
// Puro y sin base de datos.

import { addDays, diffDays, isoDateString, parseIsoDate } from '../dates';
import type { Falta } from '../running/progress';
import {
  comparacionDe,
  lecturaMedida,
  lecturaSinDato,
  pctCobertura,
  serieDe,
  type Comparacion,
  type Familia,
  type GrupoLectura,
  type Lectura,
  type Procedencia,
  type PuntoSerie,
  type Referencia,
  type Reparto,
  type Serie,
  type Unidad,
  type VeredictoLectura,
} from './lectura';
import type { CandidatoRecord } from './records';
import { lunesDe } from './semanas';
import type { Periodo, VentanaResuelta } from './ventana';

/** Hacia dónde es mejor una métrica: `menor` (un tiempo, un ritmo) o `mayor` (kilos, vatios, metros). */
export type Sentido = 'menor' | 'mayor';

/** Cualquier observación, fechada en el día LOCAL del atleta (`YYYY-MM-DD`). */
export interface Fechada {
  dia: string;
}

/** El número de una métrica en un periodo, con lo que lo sostiene. */
export interface MedidaPeriodo {
  valor: number;
  /** Observaciones reales detrás del número. */
  muestras: number;
  /** Días distintos con observación. */
  dias_con_dato: number;
  /** El último día con observación. */
  ultimo: string;
}

/** Evidencia mínima por periodo para comparar una MEDIA (la misma que el tercer peldaño de correr). */
export const MINIMO_MEDIA = 3;
/** Un MEJOR es un hecho: basta uno por periodo. */
export const MINIMO_MEJOR = 1;

// ---------------------------------------------------------------------------
// PERIODOS
// ---------------------------------------------------------------------------

/** Las observaciones de un periodo de días locales (ambos extremos incluidos). */
export function enPeriodo<T extends Fechada>(obs: readonly T[], p: Pick<Periodo, 'desde' | 'hasta'>): T[] {
  return obs.filter((o) => o.dia >= p.desde && o.dia <= p.hasta);
}

/** Un periodo de `dias` días que acaba en `hasta`. */
export function periodoHasta(hasta: string, dias: number): Periodo {
  return { desde: isoDateString(addDays(parseIsoDate(hasta), -(Math.max(1, dias) - 1))), hasta, dias: Math.max(1, dias) };
}

/**
 * La medida de un grupo de observaciones: el `agregar` de la familia (el mejor,
 * una media ponderada…) y lo que lo sostiene. Null sin observaciones o cuando el
 * agregado no se puede calcular.
 */
export function medidaDe<T extends Fechada>(obs: readonly T[], agregar: (obs: readonly T[]) => number | null): MedidaPeriodo | null {
  if (obs.length === 0) return null;
  const valor = agregar(obs);
  if (valor == null || !Number.isFinite(valor)) return null;
  const dias = new Set(obs.map((o) => o.dia));
  let ultimo = obs[0]!.dia;
  for (const o of obs) if (o.dia > ultimo) ultimo = o.dia;
  return { valor, muestras: obs.length, dias_con_dato: dias.size, ultimo };
}

/** Las medidas que la regla necesita, de una vez. */
export interface MedidasProgreso {
  /** En la ventana. */
  actual: MedidaPeriodo | null;
  /** En la anterior de igual longitud (null en `todo`, o sin dato allí). */
  anterior: MedidaPeriodo | null;
  /** Si la ventana no tiene nada: la métrica en un periodo de igual longitud que acaba en la última observación. */
  ultima: MedidaPeriodo | null;
  /** El día de la primera observación de esta métrica (de siempre). Null sin ninguna. */
  primera: string | null;
}

export function medidasDe<T extends Fechada>(
  obs: readonly T[],
  ventana: VentanaResuelta,
  agregar: (obs: readonly T[]) => number | null,
): MedidasProgreso {
  const hasta = obs.filter((o) => o.dia <= ventana.hasta);
  const actual = medidaDe(enPeriodo(hasta, ventana), agregar);
  const anterior = ventana.anterior ? medidaDe(enPeriodo(hasta, ventana.anterior), agregar) : null;
  let primera: string | null = null;
  for (const o of hasta) if (primera == null || o.dia < primera) primera = o.dia;

  let ultima: MedidaPeriodo | null = null;
  if (actual == null) {
    let ultimoDia: string | null = null;
    for (const o of hasta) if (o.dia < ventana.desde && (ultimoDia == null || o.dia > ultimoDia)) ultimoDia = o.dia;
    if (ultimoDia != null) ultima = medidaDe(enPeriodo(hasta, periodoHasta(ultimoDia, ventana.dias)), agregar);
  }
  return { actual, anterior, ultima, primera };
}

// ---------------------------------------------------------------------------
// LA COMPARACIÓN Y LA PALABRA
// ---------------------------------------------------------------------------

/** El umbral del coach con el que se juzga el delta, en SU unidad. */
export interface UmbralCambio {
  /** La unidad del delta: `pct`, o la del umbral (`s_km` al correr). */
  unidad: Unidad;
  /** El cambio mínimo que cuenta, en `unidad`. Null = esta métrica no tiene umbral (no se juzga). */
  cambio_minimo: number | null;
  /**
   * Lleva el dato a la unidad del umbral ANTES de restar: el tiempo de un 5 km a
   * s/km, una velocidad en m/s a s/km. `anterior` se queda en la unidad del dato;
   * el delta sale en la del umbral.
   */
  aUnidad?: ((v: number) => number) | undefined;
}

/** La comparación con el periodo anterior, en la unidad del umbral. */
export function comparacionCon(args: {
  valor: number;
  anterior: number | null;
  periodo: { desde: string; hasta: string };
  umbral: UmbralCambio;
}): Comparacion {
  const { umbral } = args;
  const conv = umbral.aUnidad;
  if (!conv) {
    return comparacionDe({ valor: args.valor, anterior: args.anterior, unidad: umbral.unidad, periodo: args.periodo, cambio_minimo: umbral.cambio_minimo });
  }
  const c = comparacionDe({
    valor: conv(args.valor),
    anterior: args.anterior == null ? null : conv(args.anterior),
    unidad: umbral.unidad,
    periodo: args.periodo,
    cambio_minimo: umbral.cambio_minimo,
  });
  return { ...c, anterior: args.anterior };
}

/** Las tres palabras del «¿mejoro?». El cliente colorea por `code`. */
export const VEREDICTOS_PROGRESO: Record<'mejor' | 'igual' | 'peor', VeredictoLectura> = {
  mejor: { code: 'mejor', etiqueta_es: 'Vas a más', frase_es: null, tono: 'bien' },
  igual: { code: 'igual', etiqueta_es: 'Te mantienes', frase_es: null, tono: 'neutro' },
  peor: { code: 'peor', etiqueta_es: 'Vas a menos', frase_es: null, tono: 'atencion' },
};

/**
 * La palabra de una comparación: `igual` si el cambio no llega al umbral del
 * coach, `mejor` o `peor` según el sentido de la métrica. Null sin delta o sin
 * umbral (esa métrica no se juzga).
 */
export function veredictoDeCambio(c: Comparacion | null, sentido: Sentido): VeredictoLectura | null {
  if (c == null || c.delta == null || c.significativo == null) return null;
  if (!c.significativo) return VEREDICTOS_PROGRESO.igual;
  const mejora = sentido === 'menor' ? c.delta < 0 : c.delta > 0;
  return mejora ? VEREDICTOS_PROGRESO.mejor : VEREDICTOS_PROGRESO.peor;
}

// ---------------------------------------------------------------------------
// LA LECTURA
// ---------------------------------------------------------------------------

const DIAS_POR_SEMANA = 7;

/**
 * Por qué la palabra no sale aunque haya número. Quien empezó esta familia
 * dentro de la ventana no tiene todavía periodo anterior: le falta TIEMPO y se
 * le dibuja el plazo. Quien la lleva de antes pero no tiene evidencia en uno de
 * los dos periodos no está esperando nada: le faltó la OCASIÓN.
 */
function faltaDeComparacion(primera: string | null, ventana: VentanaResuelta): Falta {
  if (primera != null && primera >= ventana.desde) {
    const llevas = Math.floor(Math.max(0, diffDays(parseIsoDate(ventana.hasta), parseIsoDate(primera))) / DIAS_POR_SEMANA);
    return { por: 'historia', llevas, hacen: Math.ceil(ventana.dias / DIAS_POR_SEMANA) + 1 };
  }
  return { por: 'ocasion' };
}

/**
 * La falta de una métrica sin NINGUNA observación. Al atleta que aún no ha
 * ejecutado nada le falta tiempo (se dibuja el plazo: una ventana entera y una
 * semana más); al que entrena pero nunca ha hecho esta familia no le falta nada
 * — esa lectura no existe en su vida y se calla.
 */
export function faltaDeFamiliaVacia(sin_historia: boolean, ventana: Pick<VentanaResuelta, 'dias'>): Falta {
  return sin_historia ? { por: 'historia', llevas: 0, hacen: Math.ceil(ventana.dias / DIAS_POR_SEMANA) + 1 } : { por: 'ocasion' };
}

/** La referencia a un récord de siempre: el número que se enseña, contra su mejor marca. */
export function referenciaRecord(medidas: MedidasProgreso, record: number | null): Referencia | null {
  const valor = medidas.actual?.valor ?? medidas.ultima?.valor ?? null;
  if (record == null || valor == null) return null;
  return { valor: record, delta: valor - record, de: 'record' };
}

export interface FilaProgreso {
  id: string;
  grupo: GrupoLectura;
  familia: Familia;
  titulo_es: string;
  /** La unidad del DATO. */
  unidad: Unidad;
  /** Null = la métrica no tiene «mejor» (un volumen, una cadencia): se compara, no se juzga. */
  sentido: Sentido | null;
  umbral: UmbralCambio;
  medidas: MedidasProgreso;
  /** Evidencia mínima en cada periodo para juzgar (`MINIMO_MEJOR` o `MINIMO_MEDIA`). */
  minimo: number;
  ventana: VentanaResuelta;
  serie?: Serie | null | undefined;
  reparto?: Reparto | null | undefined;
  referencia?: Referencia | null | undefined;
  procedencia: Procedencia;
  /** Cuando no hay NINGUNA observación: `ocasion` (se calla) o `historia` (a quien aún no ha entrenado nada). */
  falta_sin_dato: Falta;
  /** Una puerta más del método (las semanas mínimas de correr): retira la palabra, nunca el número. */
  puerta?: Falta | null | undefined;
}

/** Una métrica de progreso con sus cuatro estados resueltos. */
export function lecturaProgreso(f: FilaProgreso): Lectura {
  const { actual, anterior, ultima, primera } = f.medidas;
  const base = { id: f.id, grupo: f.grupo, familia: f.familia, titulo_es: f.titulo_es, procedencia: f.procedencia };

  if (actual != null) {
    const comparacion =
      f.ventana.anterior != null && anterior != null
        ? comparacionCon({ valor: actual.valor, anterior: anterior.valor, periodo: f.ventana.anterior, umbral: f.umbral })
        : null;

    let falta: Falta | null = null;
    let veredicto: VeredictoLectura | null = null;
    if (f.ventana.anterior != null && f.sentido != null) {
      const comparable = anterior != null && anterior.muestras >= f.minimo && actual.muestras >= f.minimo;
      if (!comparable) falta = faltaDeComparacion(primera, f.ventana);
      else if (f.puerta) falta = f.puerta;
      else veredicto = veredictoDeCambio(comparacion, f.sentido);
    }

    return lecturaMedida({
      ...base,
      dato: { valor: actual.valor, unidad: f.unidad, referencia: f.referencia ?? null },
      comparacion,
      serie: f.serie ?? null,
      reparto: f.reparto ?? null,
      veredicto,
      cobertura: {
        muestras: actual.muestras,
        dias_ventana: f.ventana.dias,
        dias_con_dato: actual.dias_con_dato,
        pct: pctCobertura(actual.dias_con_dato, f.ventana.dias),
        falta,
      },
    });
  }

  if (ultima != null) {
    return lecturaMedida({
      ...base,
      dato: { valor: ultima.valor, unidad: f.unidad, referencia: f.referencia ?? null },
      serie: f.serie ?? null,
      reparto: f.reparto ?? null,
      cobertura: {
        muestras: ultima.muestras,
        dias_ventana: f.ventana.dias,
        dias_con_dato: 0,
        pct: pctCobertura(0, f.ventana.dias),
        falta: { por: 'viejo', ultimo: ultima.ultimo },
      },
    });
  }

  return lecturaSinDato({
    ...base,
    falta: f.falta_sin_dato,
    cobertura: { dias_ventana: f.ventana.dias, pct: pctCobertura(0, f.ventana.dias) },
  });
}

/** Lo que cada familia entrega al cargador: su fila, su detalle y sus candidatos a récord. */
export interface SalidaFamilia {
  /** La fila del bloque `progreso` (`progreso.<familia>`). */
  fila: Lectura;
  /** El detalle de la familia; la fila va la primera. */
  detalle: Lectura[];
  /** Lo que ofrece a la lista única de récords. */
  candidatos: CandidatoRecord[];
}

// ---------------------------------------------------------------------------
// LAS SERIES
// ---------------------------------------------------------------------------

/**
 * La tendencia semana a semana dentro de la ventana: un punto por semana del
 * atleta (lunes), con `null` en las semanas sin observación — un hueco real,
 * nunca un cero ni una interpolación.
 *
 * Empieza en la primera semana CON dato de la ventana: antes, esa métrica aún no
 * existía para el atleta y no es un hueco (con `todo`, un atleta con historia
 * desde 2019 arrastraba 370 semanas vacías en cada métrica). Las semanas en
 * blanco del final sí se quedan: dicen que no hay dato reciente. Sin ninguna
 * observación en la ventana, sin puntos.
 */
export function serieSemanalDe<T extends Fechada>(
  obs: readonly T[],
  ventana: Pick<Periodo, 'desde' | 'hasta'>,
  unidad: Unidad,
  agregar: (obs: readonly T[]) => number | null,
): Serie {
  const porLunes = new Map<string, T[]>();
  for (const o of enPeriodo(obs, ventana)) {
    const l = lunesDe(o.dia);
    const lista = porLunes.get(l) ?? [];
    lista.push(o);
    porLunes.set(l, lista);
  }
  const puntos: PuntoSerie[] = [];
  if (porLunes.size === 0) return serieDe({ unidad, paso: 'semana', puntos });
  let lunes = parseIsoDate([...porLunes.keys()].sort()[0]!);
  const fin = parseIsoDate(lunesDe(ventana.hasta));
  while (lunes.getTime() <= fin.getTime()) {
    const t = isoDateString(lunes);
    const grupo = porLunes.get(t);
    const v = grupo ? agregar(grupo) : null;
    puntos.push({ t, v: v != null && Number.isFinite(v) ? v : null });
    lunes = addDays(lunes, DIAS_POR_SEMANA);
  }
  return serieDe({ unidad, paso: 'semana', puntos });
}

/**
 * Una serie de intentos (un test, un WOD repetido): un punto por día con dato,
 * sin rellenar los días en blanco. Toda la historia, no solo la ventana: la
 * evolución de un test es su historia entera, y la procedencia lo dice.
 */
export function serieDeIntentos<T extends Fechada>(
  obs: readonly T[],
  unidad: Unidad,
  agregar: (obs: readonly T[]) => number | null,
): Serie {
  const porDia = new Map<string, T[]>();
  for (const o of obs) {
    const lista = porDia.get(o.dia) ?? [];
    lista.push(o);
    porDia.set(o.dia, lista);
  }
  const puntos: PuntoSerie[] = [...porDia.keys()]
    .sort()
    .map((t) => ({ t, v: agregar(porDia.get(t)!) }))
    .filter((p): p is { t: string; v: number } => p.v != null && Number.isFinite(p.v));
  return serieDe({ unidad, paso: 'dia', puntos });
}

// ---------------------------------------------------------------------------
// AGREGADOS DE USO COMÚN
// ---------------------------------------------------------------------------

/** El mejor valor según el sentido. Null sin valores. */
export function mejorDe(valores: readonly number[], sentido: Sentido): number | null {
  let mejor: number | null = null;
  for (const v of valores) {
    if (!Number.isFinite(v)) continue;
    if (mejor == null || (sentido === 'menor' ? v < mejor : v > mejor)) mejor = v;
  }
  return mejor;
}

/** Media ponderada. Null si el peso total es cero. */
export function mediaPonderada(pares: ReadonlyArray<{ valor: number; peso: number }>): number | null {
  let suma = 0;
  let peso = 0;
  for (const p of pares) {
    if (!Number.isFinite(p.valor) || !Number.isFinite(p.peso) || p.peso <= 0) continue;
    suma += p.valor * p.peso;
    peso += p.peso;
  }
  return peso > 0 ? suma / peso : null;
}

/** La mediana. Null sin valores. */
export function medianaDe(valores: readonly number[]): number | null {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** ¿`a` es estrictamente mejor que `b` según el sentido? */
export function esMejor(a: number, b: number, sentido: Sentido): boolean {
  return sentido === 'menor' ? a < b : a > b;
}

/** Semanas enteras entre dos días locales (el primero antes). */
export function semanasEntre(desde: string, hasta: string): number {
  return Math.floor(Math.max(0, diffDays(parseIsoDate(hasta), parseIsoDate(desde))) / DIAS_POR_SEMANA);
}
