// ¿HAGO LO QUE TOCA? — el cumplimiento en el bloque `semanas` del panel y en su
// detalle (docs/analiticas/modelo.md §3 fila 3, A7, A8 y §5).
//
// Tres lecturas, en la ventana única (A4) y contra el periodo anterior (A3):
//
//   semanas.cumplimiento  el número que el coach eligió (`cumplimiento_base`:
//                         sesiones, tramos o carga hecha frente a planificada),
//                         con el reparto de colores de cada sesión — el
//                         «cumplimiento por sesión» — y su serie por semana
//   semanas.adherencia    de lo que ya tocaba, cuánto se hizo (LA regla de la
//                         adherencia, `coach/adherence.ts`: solo lo debido; lo
//                         libre y lo de fuera del plan cuentan en la carga, no
//                         aquí — 0270)
//   semanas.tramos        de los tramos hechos, cuántos dentro de su banda, serie
//                         a serie y en todas las modalidades (A8)
//
// Los porcentajes se comparan en PUNTOS (de 90 % a 80 % son −10) contra el
// umbral de cambio del coach en la misma unidad (A3, arregla P1). La palabra
// (bien · regular · bajo) sale con los cortes del coach y se RETIRA cuando lo
// juzgado no llega a su cobertura mínima (`cobertura_veredicto_min_pct`, el mismo
// concepto que retira la palabra de la frescura): el número se queda y la falta
// dice por qué.
//
// Puro y sin base de datos.

import { adherencePct } from '../adherence/completion';
import type { Falta } from '../running/progress';
import {
  comparacionDe,
  lecturaMedida,
  lecturaSinDato,
  pctCobertura,
  serieDe,
  type Ancla,
  type Comparacion,
  type Lectura,
  type Parte,
  type Procedencia,
  type PuntoSerie,
  type VeredictoLectura,
} from './lectura';
import { anclaMasDebil } from './anclas';
import type { BaseCumplimiento, CoachAnalyticsMethod } from './metodo';
import type { Periodo, VentanaResuelta } from './ventana';
import type { MotivoSinDato } from './cumplimiento-bandas';
import { colorDePct, lunesDelPeriodo, type EstadoSesion, type FilaSesion } from './cumplimiento-sesion';

const GRUPO = 'semanas' as const;

/** Lo hecho sin plan del coach en un periodo: libres, fuera del plan, importaciones (gris). */
export interface ResumenSinPlan {
  sesiones: number;
  segundos: number;
  /** Null cuando ninguna se pudo preciar. */
  tss: number | null;
}

export interface EntradaCumplimiento {
  hoy: string;
  ventana: VentanaResuelta;
  metodo: CoachAnalyticsMethod;
  /** Las sesiones del plan de la ventana Y del periodo anterior, ya juzgadas. */
  sesiones: readonly FilaSesion[];
  sin_plan: ResumenSinPlan;
}

/** El detalle `GET …/analytics/cumplimiento?ventana=`: las mismas lecturas y sus filas. */
export interface DetalleCumplimiento {
  athlete_id: string;
  generado_iso: string;
  ventana: VentanaResuelta;
  metodo: CoachAnalyticsMethod;
  lecturas: Lectura[];
  /** Las sesiones del plan de la ventana, la más reciente primero, con sus líneas y tramos. */
  sesiones: FilaSesion[];
  sin_plan: ResumenSinPlan;
}

// ---------------------------------------------------------------------------
// LAS CIFRAS DE UN PERIODO
// ---------------------------------------------------------------------------

interface Cifras {
  debidas: number;
  hechas: number;
  dias_con_debida: number;
  tramos_total: number;
  tramos_evaluables: number;
  tramos_dentro: number;
  tramos_encima: number;
  tramos_debajo: number;
  tramos_sin_dato: number;
  tramos_sin_ejecutar: number;
  carga_plan: number;
  carga_hecha: number;
  /** Debidas cuya carga planificada se sabe; y de ellas, las que entran en la cuenta. */
  carga_con_plan: number;
  carga_contadas: number;
  anclas_carga: Array<Ancla | null>;
  estados: Record<EstadoSesion, number>;
}

function enPeriodo(s: FilaSesion, p: Pick<Periodo, 'desde' | 'hasta'>): boolean {
  return s.dia >= p.desde && s.dia <= p.hasta;
}

function cifrasDe(sesiones: readonly FilaSesion[]): Cifras {
  const c: Cifras = {
    debidas: 0,
    hechas: 0,
    dias_con_debida: 0,
    tramos_total: 0,
    tramos_evaluables: 0,
    tramos_dentro: 0,
    tramos_encima: 0,
    tramos_debajo: 0,
    tramos_sin_dato: 0,
    tramos_sin_ejecutar: 0,
    carga_plan: 0,
    carga_hecha: 0,
    carga_con_plan: 0,
    carga_contadas: 0,
    anclas_carga: [],
    estados: { cumplida: 0, desviada: 0, fuera: 0, no_hecha: 0, hecha_sin_medida: 0, pendiente: 0, excluida: 0 },
  };
  const dias = new Set<string>();
  for (const s of sesiones) {
    c.estados[s.estado] += 1;
    if (!s.debida) continue;
    c.debidas += 1;
    dias.add(s.dia);
    if (s.hecha) c.hechas += 1;
    if (s.hecha && s.tramos.detalle === 'tramos') {
      c.tramos_total += s.tramos.total + s.tramos.sin_ejecutar;
      c.tramos_evaluables += s.tramos.evaluables;
      c.tramos_dentro += s.tramos.dentro;
      c.tramos_encima += s.tramos.por_encima;
      c.tramos_debajo += s.tramos.por_debajo;
      c.tramos_sin_dato += s.tramos.sin_dato;
      c.tramos_sin_ejecutar += s.tramos.sin_ejecutar;
    }
    const carga = s.bases.find((b) => b.base === 'carga');
    if (carga?.plan != null && carga.plan > 0) {
      c.carga_con_plan += 1;
      if (!s.hecha) {
        // No hecha: nada de lo que tocaba — su carga planificada entra entera.
        c.carga_plan += carga.plan;
        c.carga_contadas += 1;
      } else if (carga.comparable && carga.hecho != null) {
        c.carga_plan += carga.plan;
        c.carga_hecha += carga.hecho;
        c.carga_contadas += 1;
        if (s.base === 'carga') c.anclas_carga.push(s.ancla);
      }
    }
  }
  c.dias_con_debida = dias.size;
  return c;
}

type Metrica = 'adherencia' | 'tramos' | 'carga';

/** El porcentaje de una métrica, o null si no hay sobre qué. La adherencia, entera: LA de todas las superficies. */
function pctDe(m: Metrica, c: Cifras): number | null {
  if (m === 'adherencia') return adherencePct(c.debidas, c.hechas);
  if (m === 'tramos') return c.tramos_evaluables > 0 ? (c.tramos_dentro / c.tramos_evaluables) * 100 : null;
  return c.carga_plan > 0 ? (c.carga_hecha / c.carga_plan) * 100 : null;
}

/** Qué parte de lo que había se pudo juzgar, en %. Null = se sostiene siempre (la adherencia son cuentas). */
function juzgadoDe(m: Metrica, c: Cifras): number | null {
  if (m === 'adherencia') return null;
  if (m === 'tramos') return c.tramos_total > 0 ? (c.tramos_evaluables / c.tramos_total) * 100 : 0;
  return c.carga_con_plan > 0 ? (c.carga_contadas / c.carga_con_plan) * 100 : 0;
}

// ---------------------------------------------------------------------------
// LAS FALTAS — por qué no hay número, o por qué se retira la palabra
// ---------------------------------------------------------------------------

/**
 * Por qué los tramos de trabajo no se pudieron juzgar: el motivo más frecuente,
 * llevado al vocabulario de las faltas (su salida es lo que lo arregla). Sin un
 * solo tramo enlazado, la falta es de registro: el entreno no se grabó tramo a
 * tramo.
 */
function faltaDeTramos(sesiones: readonly FilaSesion[]): Falta {
  const cuenta = new Map<MotivoSinDato, number>();
  let sinPuntuar = 0;
  for (const s of sesiones) {
    if (!s.debida || !s.hecha) continue;
    let anota = false;
    for (const l of s.lineas) {
      for (const t of l.tramos) {
        if (t.papel !== 'trabajo' || t.veredicto !== 'sin_dato' || !t.motivo) continue;
        cuenta.set(t.motivo, (cuenta.get(t.motivo) ?? 0) + 1);
        if (t.motivo === 'sin_anotar') anota = true;
      }
    }
    if (anota) sinPuntuar += 1;
  }
  const [dominante] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  switch (dominante) {
    case 'sin_ancla':
      return { por: 'ancla' };
    case 'sin_anotar':
      return { por: 'esfuerzo', sesiones: sinPuntuar };
    case 'sin_objetivo':
    case 'relativo':
    case 'sin_1rm':
      return { por: 'intencion' };
    default:
      return { por: 'dispositivo' };
  }
}

function faltaDe(m: Metrica, c: Cifras, sesiones: readonly FilaSesion[]): Falta {
  if (c.debidas === 0) return { por: 'plan' };
  if (m === 'tramos') return c.hechas === 0 ? { por: 'ocasion' } : faltaDeTramos(sesiones);
  if (m === 'carga') return c.carga_con_plan === 0 ? { por: 'plan' } : { por: 'esfuerzo', sesiones: c.carga_con_plan - c.carga_contadas };
  return { por: 'plan' };
}

// ---------------------------------------------------------------------------
// LA LECTURA
// ---------------------------------------------------------------------------

/**
 * La palabra. Adherencia y tramos no pasan del 100 %: se cortan con «bien» y
 * «regular» del coach. La CARGA sí puede pasarse, y pasarse no es «bien»: se
 * juzga con las bandas de sesión (verde, ámbar, rojo) y dice hacia qué lado.
 */
function veredictoDe(pct: number, m: CoachAnalyticsMethod, frase: string | null, metrica: Metrica): VeredictoLectura {
  if (metrica === 'carga') {
    const { color } = colorDePct(pct, m);
    if (color === 'verde') return { code: 'bien', etiqueta_es: 'Bien', frase_es: frase, tono: 'bien' };
    const encima = pct > 100;
    if (color === 'ambar') return { code: encima ? 'por_encima' : 'regular', etiqueta_es: encima ? 'Por encima' : 'Regular', frase_es: frase, tono: 'atencion' };
    return { code: encima ? 'excedida' : 'bajo', etiqueta_es: encima ? 'Excedida' : 'Bajo', frase_es: frase, tono: 'aviso' };
  }
  if (pct >= m.cumplimiento_bien_pct) return { code: 'bien', etiqueta_es: 'Bien', frase_es: frase, tono: 'bien' };
  if (pct >= m.cumplimiento_regular_pct) return { code: 'regular', etiqueta_es: 'Regular', frase_es: frase, tono: 'atencion' };
  return { code: 'bajo', etiqueta_es: 'Bajo', frase_es: frase, tono: 'aviso' };
}

const PROCEDENCIA: Record<Metrica, { de: string; explica_es: string }> = {
  adherencia: {
    de: 'adherencia_debidas',
    explica_es: 'De las sesiones del plan que ya tocaban (su día ya pasó, u hoy si ya está hecha), cuántas hizo. Lo libre y lo de fuera del plan cuentan en la carga, no aquí.',
  },
  tramos: {
    de: 'cumplimiento_tramos',
    explica_es: 'De los tramos de las sesiones hechas, cuántos dentro de su banda (ritmo, zona, split, vatios, kilos, RIR, reps, rondas o tiempo), con la holgura de tu coach. Una línea que no se hizo cuenta fuera.',
  },
  carga: {
    de: 'cumplimiento_carga',
    explica_es: 'La carga hecha frente a la planificada en las sesiones del plan que ya tocaban. Una sesión sin hacer suma su plan y nada de lo hecho.',
  },
};

const TITULO: Record<Metrica, string> = { adherencia: 'Adherencia', tramos: 'Tramos en su banda', carga: 'Carga hecha frente al plan' };

function parte(code: string, etiqueta_es: string, valor: number, total: number): Parte {
  return { code, etiqueta_es, valor, pct: total > 0 ? (valor / total) * 100 : null };
}

function repartoPropio(m: Metrica, c: Cifras): Parte[] {
  if (m === 'tramos') {
    const t = c.tramos_total;
    return [
      parte('dentro', 'En su banda', c.tramos_dentro, t),
      parte('por_encima', 'Por encima', c.tramos_encima, t),
      parte('por_debajo', 'Por debajo', c.tramos_debajo, t),
      parte('sin_ejecutar', 'Sin hacer', c.tramos_sin_ejecutar, t),
      parte('sin_dato', 'Sin dato', c.tramos_sin_dato, t),
    ];
  }
  return [parte('hechas', 'Hechas', c.hechas, c.debidas), parte('no_hechas', 'Sin hacer', c.debidas - c.hechas, c.debidas)];
}

/**
 * EL CUMPLIMIENTO POR SESIÓN: cuántas de cada color. Verde, ámbar y rojo por sus
 * bandas; rojo también lo no hecho; las hechas sin medida comparable aparte; y
 * en gris lo hecho sin plan (libre, fuera del plan, importado).
 */
function repartoColores(c: Cifras, sinPlan: ResumenSinPlan): Parte[] {
  const e = c.estados;
  const total = e.cumplida + e.desviada + e.fuera + e.no_hecha + e.hecha_sin_medida + sinPlan.sesiones;
  return [
    parte('cumplida', 'Cumplidas', e.cumplida, total),
    parte('desviada', 'Desviadas', e.desviada, total),
    parte('fuera', 'Fuera de banda', e.fuera, total),
    parte('no_hecha', 'Sin hacer', e.no_hecha, total),
    parte('hecha_sin_medida', 'Hechas sin medida', e.hecha_sin_medida, total),
    parte('sin_plan', 'Sin plan', sinPlan.sesiones, total),
  ];
}

/** El peldaño más débil de las bandas de zona que juzgaron algún tramo. */
function anclaDeTramos(sesiones: readonly FilaSesion[]): Ancla | null {
  const anclas: Array<Ancla | null> = [];
  for (const s of sesiones) {
    for (const l of s.lineas) {
      for (const t of l.tramos) {
        for (const c of t.comprobaciones) if (c.veredicto !== 'sin_dato') anclas.push(c.objetivo?.ancla ?? null);
        for (const serie of t.series) for (const c of serie.comprobaciones) if (c.veredicto !== 'sin_dato') anclas.push(c.objetivo?.ancla ?? null);
      }
    }
  }
  return anclaMasDebil(anclas);
}

function lecturaDe(id: string, m: Metrica, e: EntradaCumplimiento, reparto: 'propio' | 'colores'): Lectura {
  const v = e.ventana;
  const enVentana = e.sesiones.filter((s) => enPeriodo(s, v));
  const c = cifrasDe(enVentana);
  const cobertura = {
    muestras: m === 'tramos' ? c.tramos_evaluables : c.debidas,
    dias_ventana: v.dias,
    dias_con_dato: c.dias_con_debida,
    pct: pctCobertura(c.dias_con_debida, v.dias),
  };
  const ancla = m === 'carga' ? anclaMasDebil(c.anclas_carga) : m === 'tramos' ? anclaDeTramos(enVentana) : null;
  const procedencia: Procedencia = { ...PROCEDENCIA[m], medida: true, ancla, proveedor: null };

  const pct = pctDe(m, c);
  if (pct == null) {
    return lecturaSinDato({ id, grupo: GRUPO, titulo_es: TITULO[m], falta: faltaDe(m, c, enVentana), cobertura, procedencia });
  }

  // Cada semana con la misma regla (null = nada que medir esa semana, no un 0).
  const puntos: PuntoSerie[] = lunesDelPeriodo(v.desde, v.hasta).map((lunes) => ({
    t: lunes,
    v: pctDe(m, cifrasDe(enVentana.filter((s) => s.semana === lunes))),
  }));

  let comparacion: Comparacion | null = null;
  if (v.anterior) {
    const anterior = v.anterior;
    comparacion = comparacionDe({
      valor: pct,
      anterior: pctDe(m, cifrasDe(e.sesiones.filter((s) => enPeriodo(s, anterior)))),
      unidad: 'puntos',
      periodo: { desde: anterior.desde, hasta: anterior.hasta },
      cambio_minimo: e.metodo.cambio_cumplimiento_pts,
    });
  }

  const juzgado = juzgadoDe(m, c);
  const sostiene = juzgado == null || juzgado >= e.metodo.cobertura_veredicto_min_pct;
  const frase =
    m === 'tramos'
      ? `${c.tramos_evaluables} de ${c.tramos_total} tramos tienen con qué juzgarse.`
      : m === 'carga'
        ? `${c.carga_contadas} de ${c.carga_con_plan} sesiones con carga planificada entran en la cuenta.`
        : null;
  const partes = reparto === 'colores' ? repartoColores(c, e.sin_plan) : repartoPropio(m, c);

  return lecturaMedida({
    id,
    grupo: GRUPO,
    titulo_es: TITULO[m],
    dato: { valor: pct, unidad: 'pct', referencia: null },
    comparacion,
    serie: serieDe({
      unidad: 'pct',
      paso: 'semana',
      puntos,
      referencias: [
        { code: 'bien', etiqueta_es: 'Bien', valor: e.metodo.cumplimiento_bien_pct },
        { code: 'regular', etiqueta_es: 'Regular', valor: e.metodo.cumplimiento_regular_pct },
      ],
    }),
    reparto: { unidad: reparto === 'propio' && m === 'tramos' ? 'tramos' : 'sesiones', total: partes.reduce((a, p) => a + p.valor, 0), partes },
    veredicto: sostiene ? veredictoDe(pct, e.metodo, frase, m) : null,
    cobertura: { ...cobertura, falta: sostiene ? null : faltaDe(m, c, enVentana) },
    procedencia: sostiene || !frase ? procedencia : { ...procedencia, explica_es: `${procedencia.explica_es} ${frase}` },
  });
}

const METRICA_DE_BASE: Record<BaseCumplimiento, Metrica> = { sesiones: 'adherencia', tramos: 'tramos', carga: 'carga' };

/** Las lecturas del cumplimiento para el bloque `semanas`. */
export function lecturasCumplimiento(e: EntradaCumplimiento): Lectura[] {
  return [
    lecturaDe('semanas.cumplimiento', METRICA_DE_BASE[e.metodo.cumplimiento_base], e, 'colores'),
    lecturaDe('semanas.adherencia', 'adherencia', e, 'propio'),
    lecturaDe('semanas.tramos', 'tramos', e, 'propio'),
  ];
}
