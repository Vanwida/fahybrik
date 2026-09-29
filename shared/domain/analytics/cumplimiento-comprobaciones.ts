// LAS COMPROBACIONES — las piezas con las que se juzga un tramo o una serie: una
// banda de intensidad, una cantidad, un tope, las rondas, y el veredicto que sale
// de todas. Interno del cumplimiento (del barril solo salen `comprobarCantidad` y
// `veredictoDeComprobaciones`, vía `cumplimiento-tramo.ts`): lo usan
// `cumplimiento-tramo.ts` (un tramo frente a un esfuerzo) y `cumplimiento-series.ts`
// (la tabla de series, el bloque entero).
//
// Tres preguntas que NUNCA se funden en un número (Alex, 12-ago: «en banda de
// ritmo y aun así corto de tiempo»): intensidad (ritmo, split, vatios, pulso,
// kilos, RIR, RPE), dosis (distancia, tiempo, reps, calorías, series, rondas) y
// resultado (el tiempo contra un tope; estación o WOD hechos).
//
// Puro y sin base de datos.

import { compararCantidad } from '../adherence/run-compliance';
import type { Ancla } from './lectura';
import {
  holguraDe,
  juzgarEje,
  resolverBanda,
  UNIDAD_EJE,
  type ContextoBandas,
  type EjeCumplimiento,
  type EjeDosis,
  type EjeIntensidad,
  type MotivoSinDato,
  type ObjetivoTramo,
  type PreguntaCumplimiento,
  type VeredictoCumplimiento,
} from './cumplimiento-bandas';
import type { Comprobacion, Esfuerzo, FilaSerie, FilaTramo, ObjetivoComprobacion, TramoEjecutado } from './cumplimiento-esfuerzos';

export function objetivoDeBanda(
  min: number | null,
  max: number | null,
  zona: ObjetivoComprobacion['zona'] = null,
  ancla: Ancla | null = null,
): ObjetivoComprobacion {
  return { min, max, zona, ancla };
}

export function sinDato(eje: EjeCumplimiento, pregunta: PreguntaCumplimiento, motivo: MotivoSinDato, objetivo: ObjetivoComprobacion | null = null): Comprobacion {
  return { eje, pregunta, unidad: UNIDAD_EJE[eje], objetivo, hecho: null, holgura: null, delta: null, veredicto: 'sin_dato', motivo };
}

export const HECHA: Comprobacion = { eje: 'hecha', pregunta: 'resultado', unidad: null, objetivo: null, hecho: 1, holgura: null, delta: null, veredicto: 'dentro', motivo: null };

/** La tolerancia relativa de la dosis del coach (0,10 = 10 %). */
export function tolerancia(ctx: ContextoBandas): number {
  return ctx.metodo.holgura_dosis_pct / 100;
}

/** En estaciones y WOD, estar hecha ES lo que se prescribe. */
export function llevaHecha(familias: readonly string[]): boolean {
  return familias.some((f) => f === 'estaciones' || f === 'wod');
}

export function util(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

/** El eje de intensidad que un objetivo pediría, aunque su banda no se pueda resolver. */
function ejeImplicito(o: ObjetivoTramo, modalidad: string | null): EjeIntensidad {
  switch (o.tipo) {
    case 'zona_ritmo':
    case 'ritmo':
      return modalidad === 'row' || modalidad === 'ski' || modalidad === 'bike' ? 'split' : 'ritmo';
    case 'zona_pulso':
    case 'pulso':
      return 'pulso';
    case 'vatios':
      return 'vatios';
    case 'rpe':
      return 'rpe';
    case 'rir':
      return 'rir';
    default:
      return 'carga';
  }
}

/** Un valor contra la banda que resuelve un objetivo de intensidad, con la holgura del coach. */
export function comprobarBanda(
  objetivo: ObjetivoTramo,
  modalidad: string | null,
  hechoDe: (eje: EjeIntensidad) => number | null,
  ctx: ContextoBandas,
  opts: { recuperacion?: boolean; retira?: (eje: EjeIntensidad) => boolean } = {},
): Comprobacion | null {
  const r = resolverBanda(objetivo, modalidad, ctx);
  if (r == null) return null;
  if ('motivo' in r) return sinDato(ejeImplicito(objetivo, modalidad), 'intensidad', r.motivo);
  const b = r.banda;
  const obj = objetivoDeBanda(b.min, b.max, b.zona, b.ancla);
  if (opts.retira?.(b.eje)) return sinDato(b.eje, 'intensidad', 'pendiente', obj);
  const hecho = hechoDe(b.eje);
  if (hecho == null) {
    const anota = b.eje === 'carga' || b.eje === 'rpe' || b.eje === 'rir';
    return sinDato(b.eje, 'intensidad', anota ? 'sin_anotar' : 'sin_medida', obj);
  }
  const holgura = holguraDe(b.eje, ctx.metodo, b);
  const j = juzgarEje(b.eje, hecho, b.min, b.max, holgura);
  // En la recuperación solo es fallo ir MÁS intenso: por debajo es controlada.
  const veredicto = opts.recuperacion && j.veredicto === 'por_debajo' ? 'dentro' : j.veredicto;
  return { eje: b.eje, pregunta: 'intensidad', unidad: UNIDAD_EJE[b.eje], objetivo: obj, hecho, holgura, delta: j.delta, veredicto, motivo: null };
}

/** Una cantidad hecha frente a la prescrita: en el trabajo falla quedarse corto; en la recuperación, pasarse. */
export function comprobarCantidad(
  eje: EjeDosis,
  prescrito: { valor: number; max: number | null },
  hecho: number | null,
  papel: 'trabajo' | 'recuperacion',
  tol: number,
): Comprobacion {
  const objetivo = objetivoDeBanda(prescrito.valor, prescrito.max);
  if (hecho == null) return sinDato(eje, 'dosis', eje === 'reps' || eje === 'series' ? 'sin_anotar' : 'sin_medida', objetivo);
  const c = compararCantidad(prescrito.valor, hecho, tol);
  if (c === 'sin_dato') return sinDato(eje, 'dosis', 'sin_medida', objetivo);
  let veredicto: VeredictoCumplimiento = 'dentro';
  if (papel === 'trabajo' && c === 'corta') veredicto = 'por_debajo';
  else if (papel === 'recuperacion' && c === 'larga') veredicto = 'por_encima';
  let delta = 0;
  if (hecho < prescrito.valor) delta = hecho - prescrito.valor;
  else if (hecho > (prescrito.max ?? prescrito.valor)) delta = hecho - (prescrito.max ?? prescrito.valor);
  return { eje, pregunta: 'dosis', unidad: UNIDAD_EJE[eje], objetivo, hecho, holgura: tol * prescrito.valor, delta, veredicto, motivo: null };
}

/** El tiempo contra un tope (for time, `time_cap`): dentro si lo cerró antes. */
export function comprobarTope(tope: number, segundos: number | null): Comprobacion {
  const objetivo = objetivoDeBanda(null, tope);
  if (util(segundos) == null) return sinDato('tiempo_tope', 'resultado', 'sin_medida', objetivo);
  const j = juzgarEje('tiempo_tope', segundos, null, tope, 0);
  return { eje: 'tiempo_tope', pregunta: 'resultado', unidad: 'segundos', objetivo, hecho: segundos, holgura: 0, delta: j.delta, veredicto: j.veredicto, motivo: null };
}

/** Los minutos cumplidos de un EMOM, cuando el registro los trae. */
export function comprobarRondas(t: TramoEjecutado, ctx: ContextoBandas): Comprobacion | null {
  if (t.rondas == null || t.rondas_prescritas == null || t.rondas_prescritas <= 0) return null;
  return comprobarCantidad('rondas', { valor: t.rondas_prescritas, max: null }, t.rondas, 'trabajo', tolerancia(ctx));
}

/**
 * El veredicto de un tramo (o de una serie):
 *   · el primero que se sale, por orden de pregunta (intensidad, dosis, resultado):
 *     un fallo es un fallo aunque falte otra cosa;
 *   · si nada se sale pero la INTENSIDAD pedida no se pudo juzgar (sin umbral, sin
 *     pulso, sin el RPE anotado), NO está «dentro»: está sin dato. La banda es la
 *     intensidad; una dosis cumplida no la confirma. En estaciones y WOD, lo
 *     prescrito es hacerlos (y su tiempo): ahí la intensidad no bloquea;
 *   · dentro si todo lo evaluable está dentro; sin dato si nada lo es.
 */
export function veredictoDeComprobaciones(
  cs: readonly Comprobacion[],
  intensidadObligatoria = true,
): { veredicto: VeredictoCumplimiento; motivo: MotivoSinDato | null } {
  const evaluables = cs.filter((c) => c.veredicto !== 'sin_dato');
  for (const p of ['intensidad', 'dosis', 'resultado'] as const) {
    const fuera = evaluables.find((c) => c.pregunta === p && c.veredicto !== 'dentro');
    if (fuera) return { veredicto: fuera.veredicto, motivo: null };
  }
  if (intensidadObligatoria) {
    const sinBanda = cs.find((c) => c.pregunta === 'intensidad' && c.veredicto === 'sin_dato');
    if (sinBanda) return { veredicto: 'sin_dato', motivo: sinBanda.motivo };
  }
  if (evaluables.length === 0) return { veredicto: 'sin_dato', motivo: cs[0]?.motivo ?? 'sin_objetivo' };
  return { veredicto: 'dentro', motivo: null };
}

/** La fila de un tramo con sus comprobaciones y su veredicto. */
export function filaDeTramo(
  t: TramoEjecutado,
  e: Esfuerzo | null,
  cs: Comprobacion[],
  opts: { plegado: boolean; familias: readonly string[]; series?: FilaSerie[] },
): FilaTramo {
  const comprobaciones = cs.length > 0 ? cs : [sinDato('hecha', 'resultado', 'sin_objetivo')];
  const v = veredictoDeComprobaciones(comprobaciones, !llevaHecha(opts.familias));
  return {
    segment_execution_id: t.id,
    posicion: t.posicion,
    pierna: t.pierna,
    papel: e?.papel ?? (t.papel_pierna === 'recovery' ? 'recuperacion' : 'trabajo'),
    fase: e?.fase ?? 'principal',
    ordinal: e?.ordinal ?? null,
    plegado: opts.plegado,
    veredicto: v.veredicto,
    motivo: v.motivo,
    comprobaciones,
    series: opts.series ?? [],
  };
}
