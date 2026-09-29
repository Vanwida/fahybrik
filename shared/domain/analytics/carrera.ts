// ¿LLEGO A MI CARRERA? — el bloque de CARRERA del panel (docs/analiticas/modelo.md
// §3 fila 7): la carrera objetivo, la disposición para competir y la previsión
// HYROX con el hueco tramo a tramo y su tendencia. Solo si hay carrera objetivo.
//
// LA DISPOSICIÓN ES UNA (`coach/race-readiness.ts`, `readRaceReadiness`): la misma
// fórmula que el roster y la ficha, con los pesos del coach. Lo que cambia aquí
// son sus ENTRADAS, que salen del mismo motor que el resto del panel: la frescura
// de la carga única con las ventanas del coach, la cobertura con el mínimo del
// coach, la variabilidad frente a la basal única (con sus puertas) y la
// adherencia de lo debido. Así el número del bloque y la curva de forma de al
// lado no pueden contar dos frescuras distintas.
//
// LA PREVISIÓN NO SE CALCULA AQUÍ: la calcula el motor de la pizarra de carrera
// (`goal-gap` en individual, `dobles-gap` en dobles) y aquí se lee tramo a tramo.
// Los ocho kilómetros van en UN tramo, «Carrera a pie», como en ese motor: partir
// la previsión en ocho carreras exige el coste de correr cansado entre estaciones
// (la «carrera comprometida»), que aún no está validado con carreras reales — y
// nada sin validar entra aquí como veredicto. Por lo mismo, la previsión no lleva
// palabra: número, banda, presupuesto y hueco.
//
// Puro y sin base de datos.

import {
  RACE_READINESS_BAND_LABEL_ES,
  RACE_READINESS_BANDS,
  readRaceReadiness,
  type DailyAssignmentCount,
  type RaceReadinessMethod,
  type RaceReadinessResult,
} from '../coach/race-readiness';
import { adherencePct } from '../adherence/completion';
import type { GoalGapResult } from '../goal-gap/types';
import { computeLoadSeries } from '../training-load/banister';
import { checkColdStart } from '../training-load/load-verdict';
import type { LoadCoverage } from '../training-load/coverage';
import { salidaDe, type Falta } from '../running/progress';
import { addDays, diffDays, isoDateString, parseIsoDate } from '../dates';
import { frenteABasal, ventanaBasalDe, type MuestraDia } from './basal';
import type { DiaCarga } from './carga-tramo';
import {
  comparacionDe,
  lecturaMedida,
  lecturaSinDato,
  serieDe,
  type Familia,
  type Lectura,
  type Procedencia,
  type PuntoSerie,
} from './lectura';
import type { CoachAnalyticsMethod } from './metodo';
import type { VentanaResuelta } from './ventana';

const GRUPO = 'carrera' as const;

// ---------------------------------------------------------------------------
// LA DISPOSICIÓN, DÍA A DÍA
// ---------------------------------------------------------------------------

/** Los días de la adherencia y de la actividad de la disposición (los de `race-readiness`). */
const DIAS_SEMANA = 7;

export interface EntradaDisposicion {
  /** Los días en los que se quiere la disposición (orden cualquiera). */
  dias: readonly string[];
  /** La serie diaria CONTIGUA de la carga única, de la primera sesión a hoy. */
  diario: readonly DiaCarga[];
  metodo: CoachAnalyticsMethod;
  /** Lo debido y lo hecho por día (regla de lo debido de `adherence`). */
  asignaciones: readonly DailyAssignmentCount[];
  /** La variabilidad cruda, en su día local. */
  vfc: readonly MuestraDia[];
  /** Los pesos del coach (0256). */
  pesos: RaceReadinessMethod;
}

export interface DisposicionDia {
  dia: string;
  resultado: RaceReadinessResult;
  /** Días de historia hasta ese día (desde la primera sesión). Null antes de empezar. */
  historia_dias: number | null;
  /** El fondo aún no ha asentado ese día: la frescura no se puede situar. */
  frio: boolean;
  /** Sesiones sin preciar en la ventana de fondo que acaba ese día. */
  sesiones_sin_saber: number;
}

function desplazar(dia: string, n: number): string {
  return isoDateString(addDays(parseIsoDate(dia), n));
}

/** El primer índice de `orden` con `dia >= desde` (búsqueda binaria sobre días ISO). */
function primerDesde<T extends { dia: string }>(orden: readonly T[], desde: string): number {
  let lo = 0;
  let hi = orden.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (orden[mid]!.dia < desde) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * La disposición de cada día pedido, con la fórmula única y las entradas del
 * motor del panel. Un día antes de la primera sesión no tiene frescura (null,
 * no cero); la variabilidad solo cuenta si pasa las puertas del coach.
 */
export function disposicionPorDia(e: EntradaDisposicion): DisposicionDia[] {
  const m = e.metodo;
  const serie = computeLoadSeries(e.diario, { ctl_tau: m.ctl_days, atl_tau: m.atl_days });
  const indice = new Map(e.diario.map((d, i) => [d.date, i]));
  const primera = e.diario.find((d) => d.sesiones > 0)?.date ?? null;
  const basalV = ventanaBasalDe(m);
  const vfc = [...e.vfc].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));

  return e.dias.map((dia) => {
    const i = indice.get(dia);
    const hoyCarga = i != null ? serie[i] : undefined;

    // La cobertura de la frescura: la ventana de fondo del coach que acaba ese día.
    let known = 0;
    let unknown = 0;
    let unknownSesiones = 0;
    let activos = 0;
    if (i != null) {
      for (let k = Math.max(0, i - m.ctl_days + 1); k <= i; k++) {
        const d = e.diario[k]!;
        known += d.known_seconds;
        unknown += d.unknown_seconds;
        unknownSesiones += d.unknown_sessions;
      }
      for (let k = Math.max(0, i - DIAS_SEMANA + 1); k <= i; k++) {
        const d = e.diario[k]!;
        if (d.known_seconds + d.unknown_seconds > 0) activos += 1;
      }
    }
    const total = known + unknown;
    const pct = total > 0 ? known / total : null;
    const historia = primera != null && primera <= dia ? diffDays(parseIsoDate(dia), parseIsoDate(primera)) + 1 : null;
    const caliente = checkColdStart(historia, m.ctl_days).is_warmed_up;
    const falta: Falta | null = unknownSesiones > 0 ? { por: 'esfuerzo', sesiones: unknownSesiones } : null;
    const cobertura: LoadCoverage = {
      state: total <= 0 ? 'no_work' : unknown <= 0 ? 'complete' : 'partial',
      pct,
      known_seconds: known,
      unknown_seconds: unknown,
      unknown_sessions: unknownSesiones,
      allows_verdict: caliente && (pct == null || pct * 100 >= m.cobertura_veredicto_min_pct),
      badge_es: null,
      note_es: null,
      action_es: falta ? salidaDe(falta) : null,
    };

    // La adherencia de lo debido en los siete días que acaban ese día.
    const desde = desplazar(dia, -(DIAS_SEMANA - 1));
    let debido = 0;
    let hecho = 0;
    for (const a of e.asignaciones) {
      if (a.date < desde || a.date > dia) continue;
      debido += a.scheduled;
      hecho += a.completed;
    }

    // La variabilidad frente a la basal única, con las MISMAS puertas que el
    // bloque de recuperación: sin ellas, el delta no existe.
    const ventanaVfc = vfc.slice(primerDesde(vfc, desplazar(dia, -Math.max(basalV.dias, DIAS_SEMANA))), primerDesde(vfc, desplazar(dia, 1)));
    const fb = frenteABasal(ventanaVfc, dia, basalV);
    const vale = fb.reciente.noches >= m.hrv_min_nights_recent && fb.basal.noches >= m.hrv_min_nights_baseline;

    const resultado = readRaceReadiness(
      {
        tsb: hoyCarga ? hoyCarga.tsb : null,
        compliance_pct: adherencePct(debido, hecho),
        hrv_delta_ms: vale ? fb.delta : null,
        active_days_7d: activos,
        load_coverage: cobertura,
      },
      e.pesos,
    );
    return { dia, resultado, historia_dias: historia, frio: !caliente, sesiones_sin_saber: unknownSesiones };
  });
}

// ---------------------------------------------------------------------------
// ENTRADA DEL BLOQUE
// ---------------------------------------------------------------------------

export interface CarreraDelPanel {
  id: number;
  nombre: string;
  /** Día de la carrera (calendario del atleta). */
  fecha: string;
  /** Días que faltan desde hoy. */
  dias: number;
  /** `hyrox`, `other`… (`races.event_type`). */
  tipo: string;
  formato: string;
  objetivo_s: number | null;
}

export type NivelPrevision = 'observado' | 'estimado' | 'sin_datos';

/** Un tramo de la previsión, del motor de la pizarra de carrera. */
export interface TramoPrevision {
  slug: string;
  etiqueta_es: string;
  tipo: 'run' | 'station' | 'roxzone';
  /** Null solo cuando no hay con qué predecirlo. */
  previsto_s: number | null;
  /** ± de su banda. Null sin banda (dobles) o sin previsión. */
  banda_s: number | null;
  /** Lo que el objetivo le pide a este tramo. Null sin objetivo. */
  presupuesto_s: number | null;
  nivel: NivelPrevision;
  /** De qué evidencia sale (`carrera`, `marca`, `umbral`…). */
  fuente: string | null;
  /** Qué medir para tenerlo o estrecharlo. */
  accion_es: string | null;
  /** En dobles, quién lo hace, en palabras. Null en individual. */
  quien_es: string | null;
}

export interface PrevisionCarrera {
  formato: 'individual' | 'dobles';
  /** La suma de los tramos, solo cuando todos se predicen. */
  total_s: number | null;
  /** ± del total (compuesto de las bandas). Null sin banda. */
  banda_s: number | null;
  /** Qué parte del total sale de las carreras del propio atleta, 0-100. */
  observado_pct: number | null;
  tramos: TramoPrevision[];
  /** Dobles sin pareja activa: no hay previsión de la pareja. */
  sin_pareja: boolean;
  pareja: string | null;
}

export interface EntradaCarrera {
  hoy: string;
  ventana: VentanaResuelta;
  metodo: CoachAnalyticsMethod;
  carrera: CarreraDelPanel | null;
  /** La disposición de cada día de la ventana y del cierre del periodo anterior. */
  disposicion: readonly DisposicionDia[];
  /** Null cuando la carrera no es HYROX (no hay tramos que predecir). */
  prevision: PrevisionCarrera | null;
  /** Las previsiones completas congeladas por la pizarra (una por día), dentro de la ventana. */
  tendencia: ReadonlyArray<{ dia: string; previsto_s: number }>;
}

/**
 * La previsión individual, leída del motor de la pizarra (`computeGoalGap`) tal
 * cual: sus tramos, sus bandas, su presupuesto y qué medir para afinar cada uno.
 */
export function previsionDeGoalGap(r: GoalGapResult): PrevisionCarrera {
  const accion = new Map(r.projection.next_inputs.map((n) => [n.slug, n.action_es]));
  return {
    formato: 'individual',
    total_s: r.predicted_total_s,
    banda_s: r.predicted_total_s != null ? r.projection.band_s : null,
    observado_pct: r.projection.known_total_s > 0 ? r.projection.observed_share_pct : null,
    tramos: r.segments.map((s) => ({
      slug: s.slug,
      etiqueta_es: s.label_es,
      tipo: s.kind,
      previsto_s: s.predicted_s,
      banda_s: s.band_s,
      presupuesto_s: s.budget_s,
      nivel: s.tier,
      fuente: s.predicted_s != null ? s.source : null,
      accion_es: accion.get(s.slug) ?? null,
      quien_es: null,
    })),
    sin_pareja: false,
    pareja: null,
  };
}

// ---------------------------------------------------------------------------
// LAS LECTURAS
// ---------------------------------------------------------------------------

function lecturaObjetivo(e: EntradaCarrera): Lectura {
  const procedencia: Procedencia = { de: 'carrera_objetivo', explica_es: 'Tu carrera objetivo: la próxima con prioridad «objetivo» y fecha.', medida: true, ancla: null, proveedor: null };
  if (!e.carrera) {
    return lecturaSinDato({ id: 'carrera.objetivo', grupo: GRUPO, titulo_es: 'Carrera objetivo', falta: { por: 'objetivo' }, procedencia });
  }
  const c = e.carrera;
  return lecturaMedida({
    id: 'carrera.objetivo',
    grupo: GRUPO,
    titulo_es: c.nombre,
    dato: { valor: c.dias, unidad: 'dias', referencia: null },
    cobertura: { muestras: 1, dias_ventana: 1, dias_con_dato: 1, pct: 100 },
    procedencia: { ...procedencia, explica_es: `${c.nombre}, el ${c.fecha}${c.objetivo_s != null ? ', con objetivo de tiempo' : ''}.` },
  });
}

/**
 * Por qué no hay disposición, en el vocabulario de las faltas. Una frescura que
 * no se puede situar es falta de TIEMPO mientras el fondo arranca, y de puntuar
 * el esfuerzo después.
 */
function faltaDeDisposicion(d: DisposicionDia, m: { ctl_days: number }): Falta {
  const gap = d.resultado.gap!;
  if (gap.reason === 'no_signal') return { por: 'historia', llevas: 0, hacen: DIAS_SEMANA };
  if (gap.reason === 'partial_coverage') {
    return d.frio ? { por: 'historia', llevas: d.historia_dias ?? 0, hacen: m.ctl_days } : { por: 'esfuerzo', sesiones: d.sesiones_sin_saber };
  }
  switch (gap.missing[0]) {
    case 'compliance':
      return { por: 'plan' };
    case 'hrv':
      return { por: 'dispositivo' };
    default:
      return { por: 'historia', llevas: 0, hacen: DIAS_SEMANA };
  }
}

function lecturaDisposicion(e: EntradaCarrera): Lectura {
  const id = 'carrera.disposicion';
  const titulo_es = 'Disposición para competir';
  const { ventana: v } = e;
  const porDia = new Map(e.disposicion.map((d) => [d.dia, d]));
  const hoy = porDia.get(e.hoy);
  const puntos: PuntoSerie[] = e.disposicion
    .filter((d) => d.dia >= v.desde && d.dia <= v.hasta)
    .sort((a, b) => (a.dia < b.dia ? -1 : 1))
    .map((d) => ({ t: d.dia, v: d.resultado.reading?.score ?? null }));
  const conDato = puntos.filter((p) => p.v != null).length;
  const cobertura = { muestras: conDato, dias_ventana: v.dias, dias_con_dato: conDato, pct: v.dias > 0 ? (conDato / v.dias) * 100 : null };
  const procedencia: Procedencia = {
    de: 'disposicion_carrera',
    explica_es:
      'Frescura, adherencia, variabilidad frente a tu normal y días entrenados en la última semana, con los pesos de tu coach. Un índice para priorizar, no una medida fisiológica.',
    medida: false,
    ancla: null,
    proveedor: null,
  };
  if (!hoy || hoy.resultado.reading == null) {
    const falta = hoy ? faltaDeDisposicion(hoy, e.metodo) : { por: 'historia' as const, llevas: 0, hacen: DIAS_SEMANA };
    const nota = hoy?.resultado.gap && !(hoy.frio && hoy.resultado.gap.reason === 'partial_coverage') ? ` ${hoy.resultado.gap.note_es}` : '';
    return lecturaSinDato({ id, grupo: GRUPO, titulo_es, falta, cobertura, procedencia: { ...procedencia, explica_es: `${procedencia.explica_es}${nota}` } });
  }
  const r = hoy.resultado.reading;
  const antes = v.anterior ? porDia.get(v.anterior.hasta)?.resultado.reading?.score ?? null : null;
  return lecturaMedida({
    id,
    grupo: GRUPO,
    titulo_es,
    dato: { valor: r.score, unidad: 'puntos', referencia: null },
    comparacion: v.anterior
      ? comparacionDe({ valor: r.score, anterior: antes, unidad: 'puntos', periodo: { desde: v.anterior.desde, hasta: v.anterior.hasta }, cambio_minimo: null })
      : null,
    serie: serieDe({ unidad: 'puntos', paso: 'dia', puntos }),
    reparto: {
      unidad: 'puntos',
      total: r.score,
      partes: RACE_READINESS_BANDS.map((b) => ({ code: b, etiqueta_es: RACE_READINESS_BAND_LABEL_ES[b], valor: r.bands[b], pct: r.score > 0 ? (r.bands[b] / r.score) * 100 : null })),
    },
    cobertura,
    procedencia,
  });
}

/** De qué evidencia sale cada tramo, en palabras (`EvidenceSource`, shared/domain/evidence.ts). */
const FUENTE_ES: Record<string, string> = {
  carrera: 'tu última carrera',
  simulacion: 'una simulación tuya',
  marca: 'una marca tuya',
  vo2max: 'tu VO₂ máx del reloj',
  umbral: 'tu umbral',
  ejecuciones: 'tus entrenos',
  referencia: 'una referencia típica del tramo',
};

function familiaDeTramo(t: TramoPrevision): Familia | null {
  return t.tipo === 'run' ? 'correr' : t.tipo === 'station' ? 'estaciones' : null;
}

const NO_VALIDADA = 'Una previsión, aún sin validar con carreras reales: número, banda y hueco, sin veredicto.';

function lecturaPrevision(e: EntradaCarrera, p: PrevisionCarrera): Lectura {
  const id = 'carrera.prevision';
  const titulo_es = 'Tiempo previsto';
  const c = e.carrera!;
  const conocidos = p.tramos.filter((t) => t.previsto_s != null).length;
  const cobertura = { muestras: conocidos, dias_ventana: 0, dias_con_dato: 0, pct: null };
  const procedencia: Procedencia = {
    de: p.formato === 'dobles' ? 'prevision_hyrox_dobles' : 'prevision_hyrox',
    explica_es: `La suma de los ${p.tramos.length} tramos, cada uno de tu mejor evidencia (${conocidos} de ${p.tramos.length} con dato).${p.observado_pct != null ? ` Un ${p.observado_pct} % sale de tus propias carreras.` : ''} ${NO_VALIDADA}`,
    medida: (p.observado_pct ?? 0) >= 50,
    ancla: null,
    proveedor: null,
  };
  if (p.sin_pareja) return lecturaSinDato({ id, grupo: GRUPO, titulo_es, falta: { por: 'pareja' }, cobertura, procedencia });
  if (p.total_s == null) {
    return lecturaSinDato({ id, grupo: GRUPO, titulo_es, falta: { por: 'marcas', faltan: p.tramos.length - conocidos }, cobertura, procedencia });
  }
  const puntos: PuntoSerie[] = e.tendencia
    .filter((t) => t.dia >= e.ventana.desde && t.dia <= e.ventana.hasta)
    .map((t) => ({ t: t.dia, v: t.previsto_s }));
  return lecturaMedida({
    id,
    grupo: GRUPO,
    titulo_es,
    dato: {
      valor: p.total_s,
      unidad: 'segundos',
      referencia: c.objetivo_s != null ? { valor: c.objetivo_s, delta: p.total_s - c.objetivo_s, de: 'objetivo' } : null,
      rango: p.banda_s != null ? { bajo: Math.max(0, p.total_s - p.banda_s), alto: p.total_s + p.banda_s } : null,
    },
    serie:
      puntos.length > 0
        ? serieDe({ unidad: 'segundos', paso: 'dia', puntos, referencias: c.objetivo_s != null ? [{ code: 'objetivo', etiqueta_es: 'Tu objetivo', valor: c.objetivo_s }] : null })
        : null,
    reparto: {
      unidad: 'segundos',
      total: p.total_s,
      partes: p.tramos.map((t) => ({ code: t.slug, etiqueta_es: t.etiqueta_es, valor: t.previsto_s ?? 0, pct: ((t.previsto_s ?? 0) / p.total_s!) * 100 })),
    },
    cobertura,
    procedencia,
  });
}

function lecturaTramo(t: TramoPrevision): Lectura {
  const id = `carrera.tramo.${t.slug}`;
  const familia = familiaDeTramo(t);
  const quien = t.quien_es ? ` ${t.quien_es}.` : '';
  const fuente = t.fuente ? FUENTE_ES[t.fuente] ?? t.fuente : null;
  const procedencia: Procedencia = {
    de: `prevision_${t.fuente ?? 'sin_datos'}`,
    explica_es:
      t.previsto_s == null
        ? `Sin carrera, marca, umbral ni entreno de este tramo.${t.accion_es ? ` ${t.accion_es}.` : ''}${quien}`
        : `Sale de ${fuente ?? 'tu evidencia'}${t.nivel === 'observado' ? ', aún reciente' : ''}.${t.accion_es ? ` Para afinarlo: ${t.accion_es.toLowerCase()}.` : ''}${quien}`,
    medida: t.nivel === 'observado',
    ancla: null,
    proveedor: null,
  };
  const cobertura = { muestras: t.previsto_s != null ? 1 : 0, dias_ventana: 0, dias_con_dato: 0, pct: null };
  if (t.previsto_s == null || t.nivel === 'sin_datos') {
    return lecturaSinDato({ id, grupo: GRUPO, familia, titulo_es: t.etiqueta_es, falta: { por: 'marcas', faltan: 1 }, cobertura, procedencia });
  }
  return lecturaMedida({
    id,
    grupo: GRUPO,
    familia,
    titulo_es: t.etiqueta_es,
    dato: {
      valor: t.previsto_s,
      unidad: 'segundos',
      // El hueco: positivo = lo que este tramo te cuesta sobre tu objetivo.
      referencia: t.presupuesto_s != null ? { valor: t.presupuesto_s, delta: t.previsto_s - t.presupuesto_s, de: 'presupuesto_objetivo' } : null,
      rango: t.banda_s != null ? { bajo: Math.max(0, t.previsto_s - t.banda_s), alto: t.previsto_s + t.banda_s } : null,
    },
    cobertura,
    procedencia,
  });
}

/** Las lecturas del bloque. Sin carrera objetivo, una sola: la que la pide. */
export function lecturasCarrera(e: EntradaCarrera): Lectura[] {
  const lecturas: Lectura[] = [lecturaObjetivo(e)];
  if (!e.carrera) return lecturas;
  lecturas.push(lecturaDisposicion(e));
  if (e.prevision) {
    lecturas.push(lecturaPrevision(e, e.prevision));
    if (!e.prevision.sin_pareja) for (const t of e.prevision.tramos) lecturas.push(lecturaTramo(t));
  }
  return lecturas;
}
