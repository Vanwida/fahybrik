// ¿ASIMILO? — el bloque de RECUPERACIÓN del panel (docs/analiticas/modelo.md §3
// fila 8): variabilidad, pulso en reposo y sueño contra UNA basal, y el
// readiness de hoy con las bandas de su coach.
//
// LA BASAL ES UNA (./basal.ts): la misma función, la misma ventana del coach y
// el mismo día local para las tres señales. Antes había tres basales con tres
// ventanas (P3, P16) y el mismo atleta podía estar «bajo» en una pantalla y «en
// su normal» en otra.
//
// CADA SEÑAL, TRES NÚMEROS Y UNA PALABRA:
//   dato        lo RECIENTE (la media de los últimos siete días, hoy incluido)
//   referencia  su BASAL (la del coach), con el delta ya restado
//   comparacion lo reciente al cierre del periodo anterior de igual longitud,
//               con el delta en la unidad del cambio que el coach fija para esa
//               métrica (variabilidad en %, reposo en latidos, sueño en horas)
//   veredicto   por debajo / en tu normal / por encima de la basal, con ESE
//               mismo cambio mínimo: un 2 % menos de variabilidad es ruido, un
//               8 % es una semana distinta.
// Las puertas son las del coach: sin noches recientes el aparato no está
// midiendo (falta el reloj, esperar no lo arregla); sin noches de basal lo que
// falta es tiempo, y se le dibuja el plazo.
//
// EL READINESS (P14). Las bandas «bien / cautela / bajo» estaban escritas en
// Swift (67 y 45, y otras dos parejas distintas en la ficha del detalle). Son
// método del coach (`coach_signal_thresholds`, 0211): el servidor las aplica y
// las sirve — como veredicto y como líneas de la serie — y la app pinta.
//
// Puro y sin base de datos.

import { readinessBandOf, type ReadinessBand } from '../coach/signal-thresholds';
import { diffDays, parseIsoDate } from '../dates';
import { comparaConBasal, recienteDe, type MuestraDia } from './basal';
import {
  comparacionDe,
  lecturaMedida,
  lecturaSinDato,
  pctCobertura,
  serieDe,
  type Comparacion,
  type Lectura,
  type Procedencia,
  type PuntoSerie,
  type ReferenciaSerie,
  type Unidad,
  type VeredictoLectura,
} from './lectura';
import type { CoachAnalyticsMethod } from './metodo';
import { diasDelPeriodo, type VentanaResuelta } from './ventana';

const GRUPO = 'recuperacion' as const;

// ---------------------------------------------------------------------------
// ENTRADA
// ---------------------------------------------------------------------------

/** Las bandas del readiness del coach (0–100), y cuánto vale una lectura vieja. */
export interface BandasReadiness {
  /** «Bien» desde aquí (`readiness_ok_min`). */
  ok_min: number;
  /** «Con cautela» desde aquí; por debajo, «bajo» (`readiness_caution_min`). */
  cautela_min: number;
  /** Días que una lectura sigue describiendo hoy (`readiness_max_age_days`). */
  max_edad_dias: number;
}

export interface ReadinessHoy {
  puntos: number;
  /** El día del que es (hoy, o el último guardado). */
  dia: string;
  /** Contra hace siete días. Null sin lectura de entonces. */
  delta_7d: number | null;
}

export interface EntradaRecuperacionPanel {
  hoy: string;
  ventana: VentanaResuelta;
  metodo: CoachAnalyticsMethod;
  /** Cada lectura cruda de variabilidad (ms), en su día local. Desde la basal del primer día que se compara. */
  vfc: readonly MuestraDia[];
  /** Un valor por día local (el resolvedor de reposo ya eligió la última revisión), ppm. */
  pulso_reposo: readonly MuestraDia[];
  /** Horas de cada noche, en el día en que se despierta. */
  sueno: readonly MuestraDia[];
  /** Quién midió cada señal, cuando hay un solo aparato detrás. */
  proveedor: { vfc: string | null; pulso_reposo: string | null; sueno: string | null };
  readiness: {
    hoy: ReadinessHoy | null;
    /** Los días con readiness guardado dentro de la ventana (y del periodo anterior). */
    serie: ReadonlyArray<{ dia: string; puntos: number }>;
    bandas: BandasReadiness;
  };
}

// ---------------------------------------------------------------------------
// EL READINESS — la banda del coach, aplicada una vez
// ---------------------------------------------------------------------------

const BANDA_ES: Record<ReadinessBand, Pick<VeredictoLectura, 'code' | 'etiqueta_es' | 'tono'>> = {
  ok: { code: 'bien', etiqueta_es: 'Bien', tono: 'bien' },
  caution: { code: 'cautela', etiqueta_es: 'Con cautela', tono: 'atencion' },
  low: { code: 'bajo', etiqueta_es: 'Bajo', tono: 'aviso' },
};

/**
 * La palabra de un readiness con las bandas de SU coach. La usan la cabecera
 * (`estado.readiness`) y este bloque: un solo sitio decide qué es «bien».
 */
export function veredictoReadiness(puntos: number, bandas: BandasReadiness): VeredictoLectura {
  const banda = readinessBandOf(puntos, { readiness_ok_min: bandas.ok_min, readiness_caution_min: bandas.cautela_min });
  return { ...BANDA_ES[banda], frase_es: null };
}

/** Las dos líneas de corte, en puntos reales, para pintar las bandas. */
export function referenciasReadiness(bandas: BandasReadiness): ReferenciaSerie[] {
  return [
    { code: 'cautela_desde', etiqueta_es: 'Con cautela', valor: bandas.cautela_min },
    { code: 'bien_desde', etiqueta_es: 'Bien', valor: bandas.ok_min },
  ];
}

/** ¿Sigue esa lectura describiendo hoy, según el coach? */
export function readinessVigente(dia: string, hoy: string, bandas: BandasReadiness): boolean {
  return diffDays(parseIsoDate(hoy), parseIsoDate(dia)) <= bandas.max_edad_dias;
}

const EXPLICA_READINESS =
  'Tu readiness: check-in, variabilidad, sueño y pulso en reposo con los pesos de tu coach, y sus bandas.';

function lecturaReadiness(e: EntradaRecuperacionPanel): Lectura {
  const id = 'recuperacion.readiness';
  const titulo_es = 'Readiness';
  const { ventana: v, readiness: r } = e;
  const dias = diasDelPeriodo(v);
  const porDia = new Map(r.serie.map((p) => [p.dia, p.puntos]));
  if (r.hoy) porDia.set(r.hoy.dia, r.hoy.puntos);
  const puntos: PuntoSerie[] = dias.map((d) => ({ t: d, v: porDia.get(d) ?? null }));
  const dias_con_dato = puntos.filter((p) => p.v != null).length;
  const cobertura = { muestras: dias_con_dato, dias_ventana: v.dias, dias_con_dato, pct: pctCobertura(dias_con_dato, v.dias) };
  const procedencia: Procedencia = { de: 'readiness_compuesto', explica_es: EXPLICA_READINESS, medida: false, ancla: null, proveedor: null };

  if (r.hoy == null) {
    return lecturaSinDato({ id, grupo: GRUPO, titulo_es, falta: { por: 'dispositivo' }, cobertura, procedencia });
  }

  const vigente = readinessVigente(r.hoy.dia, e.hoy, r.bandas);
  // El mismo número al cierre del periodo anterior: el último guardado dentro de él.
  let anterior: number | null = null;
  if (v.anterior) {
    for (const p of r.serie) if (p.dia >= v.anterior.desde && p.dia <= v.anterior.hasta) anterior = p.puntos;
  }
  const comparacion: Comparacion | null = v.anterior
    ? comparacionDe({ valor: r.hoy.puntos, anterior, unidad: 'puntos', periodo: { desde: v.anterior.desde, hasta: v.anterior.hasta }, cambio_minimo: null })
    : null;

  return lecturaMedida({
    id,
    grupo: GRUPO,
    titulo_es,
    dato: {
      valor: r.hoy.puntos,
      unidad: 'puntos',
      referencia: r.hoy.delta_7d == null ? null : { valor: r.hoy.puntos - r.hoy.delta_7d, delta: r.hoy.delta_7d, de: 'hace_7d' },
    },
    comparacion,
    serie: serieDe({ unidad: 'puntos', paso: 'dia', puntos, referencias: referenciasReadiness(r.bandas) }),
    // Una lectura vieja se enseña, fechada, pero ya no dice cómo estás HOY.
    veredicto: vigente ? veredictoReadiness(r.hoy.puntos, r.bandas) : null,
    cobertura: { ...cobertura, falta: vigente ? null : { por: 'dispositivo' } },
    procedencia: {
      ...procedencia,
      medida: r.hoy.dia === e.hoy,
      explica_es: r.hoy.dia === e.hoy ? EXPLICA_READINESS : `El último readiness disponible, del ${r.hoy.dia}: hoy aún no hay señal.`,
    },
  });
}

// ---------------------------------------------------------------------------
// LAS TRES SEÑALES — un mismo mecanismo, tres configuraciones
// ---------------------------------------------------------------------------

type Sentido = 'mas_es_mejor' | 'menos_es_mejor';

interface Senal {
  id: string;
  titulo_es: string;
  unidad: Unidad;
  muestras: (e: EntradaRecuperacionPanel) => readonly MuestraDia[];
  proveedor: (e: EntradaRecuperacionPanel) => string | null;
  redondeo: (n: number) => number;
  sentido: Sentido;
  /** El cambio mínimo del coach para esta métrica, y la unidad en que se mide. */
  cambio: (m: CoachAnalyticsMethod) => { unidad: Unidad; minimo: number };
  de: string;
  explica_es: (m: CoachAnalyticsMethod) => string;
  /** Líneas de referencia además de la basal (el objetivo de sueño). */
  extra: (m: CoachAnalyticsMethod) => ReferenciaSerie[];
  palabras: { debajo: string; encima: string; normal: string };
}

const entero = (n: number) => Math.round(n);
const decima = (n: number) => Math.round(n * 10) / 10;

function ventanaTexto(m: CoachAnalyticsMethod): string {
  return `de hace ${m.basal_dias} a hace ${m.basal_excluir_dias + 1} días`;
}

const SENALES: readonly Senal[] = [
  {
    id: 'recuperacion.variabilidad',
    titulo_es: 'Variabilidad',
    unidad: 'ms',
    muestras: (e) => e.vfc,
    proveedor: (e) => e.proveedor.vfc,
    redondeo: entero,
    sentido: 'mas_es_mejor',
    cambio: (m) => ({ unidad: 'pct', minimo: m.cambio_variabilidad_pct }),
    de: 'basal_vfc',
    explica_es: (m) => `Media de tu variabilidad (VFC) de los últimos 7 días frente a tu normal, la media ${ventanaTexto(m)}.`,
    extra: () => [],
    palabras: { debajo: 'Por debajo de tu normal', encima: 'Por encima de tu normal', normal: 'En tu normal' },
  },
  {
    id: 'recuperacion.pulso_reposo',
    titulo_es: 'Pulso en reposo',
    unidad: 'bpm',
    muestras: (e) => e.pulso_reposo,
    proveedor: (e) => e.proveedor.pulso_reposo,
    redondeo: entero,
    sentido: 'menos_es_mejor',
    cambio: (m) => ({ unidad: 'bpm', minimo: m.cambio_pulso_reposo_bpm }),
    de: 'basal_pulso_reposo',
    explica_es: (m) => `Media de tu pulso en reposo de los últimos 7 días frente a tu normal, la media ${ventanaTexto(m)}.`,
    extra: () => [],
    palabras: { debajo: 'Más bajo que tu normal', encima: 'Más alto que tu normal', normal: 'En tu normal' },
  },
  {
    id: 'recuperacion.sueno',
    titulo_es: 'Sueño',
    unidad: 'horas',
    muestras: (e) => e.sueno,
    proveedor: (e) => e.proveedor.sueno,
    redondeo: decima,
    sentido: 'mas_es_mejor',
    cambio: (m) => ({ unidad: 'horas', minimo: m.cambio_sueno_horas }),
    de: 'basal_sueno',
    explica_es: (m) =>
      `Horas por noche de los últimos 7 días (cada noche en el día en que te despiertas) frente a tu normal, la media ${ventanaTexto(m)}.`,
    extra: (m) => [{ code: 'objetivo', etiqueta_es: 'Noche completa', valor: m.sleep_target_hours }],
    palabras: { debajo: 'Duermes menos que tu normal', encima: 'Duermes más que tu normal', normal: 'En tu normal' },
  },
];

/** La diferencia en la unidad del cambio del coach: % sobre la basal, o la resta. */
function diferenciaEn(unidad: Unidad, valor: number, basal: number): number | null {
  if (unidad === 'pct') return basal !== 0 ? ((valor - basal) / Math.abs(basal)) * 100 : null;
  return valor - basal;
}

function veredictoSenal(s: Senal, diferencia: number | null, minimo: number): VeredictoLectura | null {
  if (diferencia == null) return null;
  if (Math.abs(diferencia) < minimo) return { code: 'en_tu_normal', etiqueta_es: s.palabras.normal, frase_es: null, tono: 'bien' };
  const arriba = diferencia > 0;
  const bueno = s.sentido === 'mas_es_mejor' ? arriba : !arriba;
  return {
    code: arriba ? 'por_encima' : 'por_debajo',
    etiqueta_es: arriba ? s.palabras.encima : s.palabras.debajo,
    frase_es: null,
    tono: bueno ? 'bien' : 'atencion',
  };
}

function lecturaSenal(s: Senal, e: EntradaRecuperacionPanel): Lectura {
  const { ventana: v, metodo: m } = e;
  const muestras = s.muestras(e);

  // La serie: un punto por día de la ventana (la media de ese día), hueco sin dato.
  const porDia = new Map<string, number[]>();
  for (const x of muestras) {
    if (x.dia < v.desde || x.dia > v.hasta || !Number.isFinite(x.valor)) continue;
    const arr = porDia.get(x.dia);
    if (arr) arr.push(x.valor);
    else porDia.set(x.dia, [x.valor]);
  }
  const puntos: PuntoSerie[] = diasDelPeriodo(v).map((d) => {
    const vals = porDia.get(d);
    return { t: d, v: vals ? s.redondeo(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
  });
  const enVentana = [...porDia.values()].reduce((a, arr) => a + arr.length, 0);
  const cobertura = { muestras: enVentana, dias_ventana: v.dias, dias_con_dato: porDia.size, pct: pctCobertura(porDia.size, v.dias) };
  const proveedor = s.proveedor(e);
  const procedencia: Procedencia = { de: s.de, explica_es: s.explica_es(m), medida: true, ancla: null, proveedor };

  const fb = comparaConBasal(muestras, e.hoy, m);
  // LAS DOS PUERTAS, lo reciente primero: sin noches recientes nadie está
  // midiendo y esperar no acerca nada; con ellas, una basal corta es cuestión
  // de tiempo y se le dibuja el plazo.
  if (fb.falla === 'reciente' || fb.reciente.valor == null) {
    return lecturaSinDato({ id: s.id, grupo: GRUPO, titulo_es: s.titulo_es, falta: { por: 'dispositivo' }, cobertura, procedencia: { ...procedencia, medida: false } });
  }
  if (fb.falla === 'basal' || fb.basal.valor == null) {
    return lecturaSinDato({
      id: s.id,
      grupo: GRUPO,
      titulo_es: s.titulo_es,
      falta: { por: 'historia', llevas: fb.basal.noches, hacen: m.hrv_min_nights_baseline },
      cobertura,
      procedencia: { ...procedencia, medida: false },
    });
  }

  // Se restan los números QUE SE ENSEÑAN, para que dato − referencia cuadre a la vista.
  const valor = s.redondeo(fb.reciente.valor);
  const basal = s.redondeo(fb.basal.valor);
  const cambio = s.cambio(m);

  let comparacion: Comparacion | null = null;
  if (v.anterior) {
    const antes = recienteDe(muestras, v.anterior.hasta);
    const anterior = antes.valor != null && antes.noches >= m.hrv_min_nights_recent ? s.redondeo(antes.valor) : null;
    comparacion = comparacionDe({
      valor,
      anterior,
      unidad: cambio.unidad,
      periodo: { desde: v.anterior.desde, hasta: v.anterior.hasta },
      cambio_minimo: cambio.minimo,
    });
  }

  return lecturaMedida({
    id: s.id,
    grupo: GRUPO,
    titulo_es: s.titulo_es,
    dato: { valor, unidad: s.unidad, referencia: { valor: basal, delta: s.redondeo(valor - basal), de: `basal_${m.basal_dias}_${m.basal_excluir_dias}d` } },
    comparacion,
    serie: serieDe({
      unidad: s.unidad,
      paso: 'dia',
      puntos,
      referencias: [{ code: 'basal', etiqueta_es: 'Tu normal', valor: basal }, ...s.extra(m)],
    }),
    veredicto: veredictoSenal(s, diferenciaEn(cambio.unidad, valor, basal), cambio.minimo),
    cobertura,
    procedencia,
  });
}

/** Las cuatro lecturas del bloque, en el orden en que se enseñan. */
export function lecturasRecuperacionPanel(e: EntradaRecuperacionPanel): Lectura[] {
  return [lecturaReadiness(e), ...SENALES.map((s) => lecturaSenal(s, e))];
}
