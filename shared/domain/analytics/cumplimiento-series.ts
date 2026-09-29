// LA TABLA DE SERIES Y EL BLOQUE ENTERO — cómo se juzga lo que se grabó serie a
// serie (fuerza, superseries) y un bloque de varios ejercicios grabado en un solo
// tramo (rondas, for time, EMOM, AMRAP…). docs/analiticas/modelo.md A8.
//
// LA TABLA SE ALINEA CON EL REGISTRO, NO CON UNA CUENTA NUESTRA. La app escribe una
// fila de `set_executions` por serie de la prescripción, en su orden y con las de
// aproximación dentro (`set_index` = posición + 1; `primeSetsIfNeeded`), y no
// multiplica por rondas. Así que la fila N se juzga contra la serie N de la
// prescripción; una de aproximación se enseña y no se juzga ni cuenta; y la tabla
// solo se expande por rondas si el registro vino expandido (tantas filas como
// rondas × series).
//
// CADA SERIE, EN CARGA Y EN ESFUERZO: los kilos (los que la app resolvió al
// entrenar mandan: un %RM ya convertido) Y el RIR o el RPE del coach, más sus reps.
//
// EL BLOQUE ENTERO: los parámetros del bloque (`total_s`, `rounds`, `work_s`) van
// copiados en cada línea, así que su reloj no se suma línea a línea: en los
// formatos de ventana compartida (AMRAP, Tabata, EMOM, death by) es UNO (el mayor
// de las líneas); en los que se hacen una detrás de otra (rondas, for time,
// chipper…) no se puede escribir de forma fiable y no se compara — su tope sí.
//
// Puro y sin base de datos.

import { formatMeta } from '../prescription/format';
import { prescriptionDuration } from '../prescription/duration';
import type { ContextoBandas, EjeCumplimiento, EjeIntensidad, ObjetivoTramo, VeredictoCumplimiento } from './cumplimiento-bandas';
import {
  comprobarBanda,
  comprobarCantidad,
  comprobarRondas,
  comprobarTope,
  filaDeTramo,
  HECHA,
  llevaHecha,
  sinDato,
  tolerancia,
  util,
  veredictoDeComprobaciones,
} from './cumplimiento-comprobaciones';
import {
  FASE_DE_LINEA,
  seriesDeLinea,
  topeDe,
  type Comprobacion,
  type Dosis,
  type Esfuerzo,
  type FilaSerie,
  type FilaTramo,
  type LineaPlan,
  type ObjetivoComprobacion,
  type SerieDelPlan,
  type SerieHecha,
  type TramoEjecutado,
} from './cumplimiento-esfuerzos';

/**
 * La carga de una serie: los kilos que la app resolvió al entrenar mandan (un %RM
 * ya convertido, con la marca que el atleta tenía ese día); si no, el objetivo de
 * carga escrito (kilos, %RM, relativo). Null si la serie no pide carga.
 */
function objetivoDeCarga(s: SerieHecha, e: Esfuerzo | null): ObjetivoTramo | null {
  if (s.kg_prescritos != null && s.kg_prescritos > 0) return { tipo: 'kg', min: s.kg_prescritos, max: s.kg_prescritos };
  const o = e?.objetivo;
  return o && (o.tipo === 'kg' || o.tipo === 'pct_rm' || o.tipo === 'relativo') ? o : null;
}

/** El esfuerzo que pide una serie (RIR o RPE), aparte de su carga: se juzgan los dos. */
function objetivoDeEsfuerzo(e: Esfuerzo | null): ObjetivoTramo | null {
  const o = e?.objetivo;
  return o && (o.tipo === 'rir' || o.tipo === 'rpe') ? o : null;
}

function juzgarSerie(s: SerieHecha, e: SerieDelPlan | null, modalidad: string | null, ctx: ContextoBandas, intensidadObligatoria: boolean): FilaSerie {
  if (e?.aproximacion) return { indice: s.indice, aproximacion: true, veredicto: 'sin_dato', comprobaciones: [] };
  const cs: Comprobacion[] = [];
  const saltada = s.estado === 'skipped';
  if (!saltada) {
    const valor = (eje: EjeIntensidad): number | null => (eje === 'carga' ? util(s.kg) : eje === 'rir' ? (s.rir != null && s.rir >= 0 ? s.rir : null) : eje === 'rpe' ? util(s.rpe) : null);
    for (const objetivo of [objetivoDeCarga(s, e), objetivoDeEsfuerzo(e)]) {
      if (!objetivo) continue;
      const i = comprobarBanda(objetivo, modalidad, valor, ctx);
      if (i) cs.push(i);
    }
  }
  const reps: Dosis | null =
    s.reps_prescritas != null && s.reps_prescritas > 0 ? { eje: 'reps', valor: s.reps_prescritas, max: null } : e?.dosis?.eje === 'reps' ? e.dosis : null;
  if (reps) cs.push(comprobarCantidad('reps', reps, saltada ? (s.reps ?? 0) : s.reps, 'trabajo', tolerancia(ctx)));
  const v = veredictoDeComprobaciones(cs.length > 0 ? cs : [sinDato('reps', 'dosis', 'sin_objetivo')], intensidadObligatoria);
  return { indice: s.indice, aproximacion: false, veredicto: v.veredicto, comprobaciones: cs };
}

/**
 * Una comprobación de tramo que resume la misma comprobación de cada serie. Las
 * reps se suman sobre las series que las tienen anotadas (lo prescrito y lo hecho
 * del mismo conjunto); lo demás se promedia. El veredicto sale de las series: la
 * dirección que más se repite entre las que se salen (empate: por debajo).
 */
function resumir(eje: EjeCumplimiento, cs: readonly Comprobacion[]): Comprobacion | null {
  if (cs.length === 0) return null;
  const evaluables = cs.filter((c) => c.veredicto !== 'sin_dato');
  const suma = eje === 'reps';
  const base = suma ? evaluables : cs;
  const mins = base.map((c) => c.objetivo?.min).filter((v): v is number => v != null);
  const maxs = base.map((c) => c.objetivo?.max).filter((v): v is number => v != null);
  const objetivo: ObjetivoComprobacion = suma
    ? { min: mins.length ? mins.reduce((a, v) => a + v, 0) : null, max: maxs.length === base.length && maxs.length > 0 ? maxs.reduce((a, v) => a + v, 0) : null, zona: null, ancla: null }
    : { min: mins.length ? Math.min(...mins) : null, max: maxs.length ? Math.max(...maxs) : null, zona: cs[0]!.objetivo?.zona ?? null, ancla: cs[0]!.objetivo?.ancla ?? null };
  if (evaluables.length === 0) return { ...cs[0]!, objetivo, hecho: null, delta: null };
  const valores = evaluables.map((c) => c.hecho).filter((v): v is number => v != null);
  const fuera = evaluables.filter((c) => c.veredicto !== 'dentro');
  const encima = fuera.filter((c) => c.veredicto === 'por_encima');
  const debajo = fuera.filter((c) => c.veredicto === 'por_debajo');
  const veredicto: VeredictoCumplimiento = fuera.length === 0 ? 'dentro' : encima.length > debajo.length ? 'por_encima' : 'por_debajo';
  const peores = veredicto === 'por_encima' ? encima : debajo;
  const delta = veredicto === 'dentro' ? 0 : peores.reduce((a, c) => (Math.abs(c.delta ?? 0) > Math.abs(a) ? (c.delta ?? 0) : a), 0);
  const hecho = valores.length === 0 ? null : suma ? valores.reduce((a, v) => a + v, 0) : valores.reduce((a, v) => a + v, 0) / valores.length;
  return { eje, pregunta: cs[0]!.pregunta, unidad: cs[0]!.unidad, objetivo, hecho, holgura: cs[0]!.holgura, delta, veredicto, motivo: null };
}

/** La tabla prescrita contra la que se alinea el registro: una ronda, o las rondas si el registro vino expandido. */
function tablaPrescrita(linea: LineaPlan, filas: number): SerieDelPlan[] {
  const { porRonda, rondas } = seriesDeLinea(linea);
  if (rondas > 1 && filas === porRonda.length * rondas) return Array.from({ length: rondas }, () => porRonda).flat();
  return porRonda;
}

/**
 * Un tramo grabado serie a serie. Con `prescritasBloque` el tramo es el bloque
 * entero (una superserie grabada de una vez): las series del bloque son las de
 * todas sus líneas y los objetivos de cada serie salen solo de lo que la app
 * guardó en ella (reps y kilos prescritos), porque no se sabe de qué ejercicio era.
 */
export function juzgarSeries(
  t: TramoEjecutado,
  linea: LineaPlan,
  ctx: ContextoBandas,
  opts: { prescritasBloque: number | null; familias?: readonly string[] } = { prescritasBloque: null },
): FilaTramo {
  const series = [...t.series].sort((a, b) => a.indice - b.indice);
  const tabla = opts.prescritasBloque != null ? [] : tablaPrescrita(linea, series.length);
  const familias = opts.familias ?? [linea.familia];
  const filas = series.map((s) => juzgarSerie(s, tabla[s.indice - 1] ?? null, linea.modalidad, ctx, !llevaHecha(familias)));
  const trabajo = filas.filter((f) => !f.aproximacion);
  const porEje = (eje: EjeCumplimiento) => trabajo.flatMap((f) => f.comprobaciones.filter((c) => c.eje === eje));
  const cs: Comprobacion[] = [];
  for (const eje of ['carga', 'rir', 'rpe'] as const) {
    const r = resumir(eje, porEje(eje));
    if (r) cs.push(r);
  }
  const prescritas = opts.prescritasBloque ?? tabla.filter((x) => !x.aproximacion).length;
  if (prescritas > 0) {
    const hechas = series.filter((s) => !tabla[s.indice - 1]?.aproximacion && s.estado !== 'skipped').length;
    cs.push(comprobarCantidad('series', { valor: prescritas, max: null }, hechas, 'trabajo', tolerancia(ctx)));
  }
  const reps = resumir('reps', porEje('reps'));
  if (reps) cs.push(reps);
  if (llevaHecha(familias)) cs.push(HECHA);
  const e: Esfuerzo = { papel: 'trabajo', fase: FASE_DE_LINEA[linea.rol], dosis: null, objetivo: null, inclinacion_pct: null, ordinal: null };
  return filaDeTramo(t, e, cs, { plegado: opts.prescritasBloque != null, familias, series: filas });
}

/** ¿Las líneas de este formato comparten UN reloj (AMRAP, Tabata, EMOM, death by)? */
function relojCompartido(formato: string | null): boolean {
  const score = formatMeta(formato)?.score;
  return score === 'rounds_reps' || score === 'pass_fail' || score === 'rounds_survived';
}

/**
 * Un tramo que es el BLOQUE entero (rondas, for time, chipper, superserie…
 * grabado de una vez): su reloj si es uno para todas las líneas, su tope, las
 * rondas si las hay, las series si las grabó, y hecho en estaciones y WOD. La
 * intensidad no: cada línea pedía la suya y el tramo las mezcla.
 */
export function juzgarBloque(t: TramoEjecutado, lineas: readonly LineaPlan[], ctx: ContextoBandas): FilaTramo {
  const principal = lineas[0]!;
  const familias = lineas.map((l) => l.familia);
  if (t.series.length > 0) {
    const prescritas = lineas.reduce((a, l) => a + seriesDeLinea(l).porRonda.filter((x) => !x.aproximacion).length, 0);
    return juzgarSeries(t, principal, ctx, { prescritasBloque: prescritas, familias });
  }
  const cs: Comprobacion[] = [];
  if (relojCompartido(principal.formato)) {
    const relojes = lineas
      .map((l) => (l.prescripcion ? prescriptionDuration(l.prescripcion) : null))
      .flatMap((d) => (d && d.known ? [d.seconds] : []));
    if (relojes.length > 0) cs.push(comprobarCantidad('tiempo', { valor: Math.max(...relojes), max: null }, util(t.segundos), 'trabajo', tolerancia(ctx)));
  }
  const tope = lineas.map((l) => topeDe(l.prescripcion)).find((x): x is number => x != null) ?? null;
  if (tope != null) cs.push(comprobarTope(tope, t.segundos));
  const rondas = comprobarRondas(t, ctx);
  if (rondas) cs.push(rondas);
  if (llevaHecha(familias)) cs.push(HECHA);
  const e: Esfuerzo = { papel: 'trabajo', fase: FASE_DE_LINEA[principal.rol], dosis: null, objetivo: null, inclinacion_pct: null, ordinal: null };
  return filaDeTramo(t, e, cs, { plegado: true, familias });
}
