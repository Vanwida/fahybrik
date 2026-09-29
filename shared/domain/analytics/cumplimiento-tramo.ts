// EL JUICIO DE UN TRAMO — prescrito frente a hecho, en tres preguntas que no se
// funden en un número (docs/analiticas/modelo.md A8; Alex, 12-ago: «en banda de
// ritmo y aun así corto de tiempo»):
//
//   intensidad  ritmo o zona (correr y cinta), split, vatios o zona (ergo), pulso
//   dosis       distancia, tiempo, repeticiones, calorías, rondas (EMOM)
//   resultado   tiempo contra el tope (WOD, roxzone); la estación o el WOD, hechos
//
// Aquí: un tramo frente a UN esfuerzo prescrito, o un tramo que cubre todos los
// esfuerzos de su línea (plegado). La tabla de series y el bloque grabado entero
// viven en `cumplimiento-series.ts`; las piezas, en `cumplimiento-comprobaciones.ts`.
//
// LA RECUPERACIÓN va al revés: solo es fallo recuperar MÁS intenso de lo pedido
// o pasarse de tiempo (`run-compliance`, Alex 12-ago). Sin objetivo ni dosis no
// se juzga. En el TRABAJO la dosis solo falla por quedarse corto.
//
// Puro y sin base de datos.

import { prescriptionDuration } from '../prescription/duration';
import { wattsDeSplit500 } from './anclas';
import type { ContextoBandas, EjeDosis, EjeIntensidad } from './cumplimiento-bandas';
import {
  comprobarBanda,
  comprobarCantidad,
  comprobarRondas,
  comprobarTope,
  filaDeTramo,
  HECHA,
  llevaHecha,
  tolerancia,
  util,
} from './cumplimiento-comprobaciones';
import { FASE_DE_LINEA, topeDe, type Comprobacion, type Dosis, type Esfuerzo, type FilaTramo, type LineaPlan, type TramoEjecutado } from './cumplimiento-esfuerzos';

// Las dos piezas que otros juzgadores reutilizan (el detalle de una sesión).
export { comprobarCantidad, veredictoDeComprobaciones } from './cumplimiento-comprobaciones';

const MAQUINAS_O_CORRER: ReadonlySet<string> = new Set(['run', 'row', 'ski', 'bike']);

/** Lo que el tramo midió en un eje de intensidad. Ritmo y split se derivan de distancia y tiempo si hace falta. */
function valorDeTramo(eje: EjeIntensidad, t: TramoEjecutado): number | null {
  const m = util(t.metros);
  const s = util(t.segundos);
  switch (eje) {
    case 'ritmo':
      return util(t.ritmo_s_km) ?? (m && s ? s / (m / 1000) : null);
    case 'split':
      return util(t.split_s_500m) ?? (m && s ? s / (m / 500) : null);
    case 'vatios':
      // En un Concept2 split y vatios son la misma medida (W = 2,80/(s/m)³).
      return util(t.vatios) ?? wattsDeSplit500(valorDeTramo('split', t));
    case 'pulso':
      return util(t.pulso_medio);
    case 'carga':
      return util(t.kg);
    case 'rpe':
    case 'rir':
      return null;
  }
}

/**
 * La cuesta que retira el ritmo, con la precedencia de siempre: lo que el coach
 * pidió en el tramo, lo que declaró la cinta, lo medido. Sin ninguna no se retira
 * (la calle sin altitud se juzga, como en el veredicto de carrera del coach).
 */
function cuestaRetira(e: Esfuerzo, t: TramoEjecutado, ctx: ContextoBandas): boolean {
  const umbral = ctx.pendiente_retira_ritmo_pct;
  if (umbral == null || !(umbral > 0)) return false;
  const g = e.inclinacion_pct ?? t.inclinacion_pct ?? t.pendiente_pct;
  return g != null && Number.isFinite(g) && Math.abs(g) >= umbral;
}

function hechoDeDosis(eje: EjeDosis, t: TramoEjecutado): number | null {
  const v = eje === 'distancia' ? t.metros : eje === 'tiempo' ? t.segundos : eje === 'reps' ? t.reps : eje === 'calorias' ? t.calorias : null;
  return v != null && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Lo que tocaba en reps en ESTE tramo. Si el registro lo dice (`reps_prescribed`:
 * el trozo que la app puso delante — las 12 de un 3×12 grabado de una vez, o la
 * parte de un doble), manda eso; si no, lo que diga la línea.
 */
function repsQueTocaban(t: TramoEjecutado, deLaLinea: Dosis | null): Dosis | null {
  if (t.reps_prescritas != null && t.reps_prescritas > 0) return { eje: 'reps', valor: t.reps_prescritas, max: null };
  return deLaLinea;
}

/**
 * Un tramo contra UN esfuerzo prescrito. Null para una recuperación que no tiene
 * nada que juzgar (sin objetivo ni dosis): no hay contra qué, y no se inventa.
 *   · `tope`: el de la línea (un for time), cuando este tramo es la línea entera;
 *   · `sinDosis`: cuando el emparejamiento no es seguro (el tramo se juzga contra
 *     el esfuerzo representativo), la dosis de ese esfuerzo no es la del tramo y
 *     no se compara — como el veredicto de carrera del coach en ese camino.
 */
export function juzgarUno(
  t: TramoEjecutado,
  e: Esfuerzo | null,
  linea: LineaPlan,
  ctx: ContextoBandas,
  opts: { tope?: number | null; sinDosis?: boolean } = {},
): FilaTramo | null {
  const cs: Comprobacion[] = [];
  if (e) {
    const modalidad = MAQUINAS_O_CORRER.has(t.modalidad ?? '') ? t.modalidad : linea.modalidad;
    if (e.objetivo) {
      const i = comprobarBanda(e.objetivo, modalidad, (eje) => valorDeTramo(eje, t), ctx, {
        recuperacion: e.papel === 'recuperacion',
        retira: (eje) => eje === 'ritmo' && cuestaRetira(e, t, ctx),
      });
      if (i) cs.push(i);
    }
    if (!opts.sinDosis) {
      const dosis = e.dosis?.eje === 'reps' || (e.dosis == null && t.reps_prescritas != null) ? repsQueTocaban(t, e.dosis) : e.dosis;
      if (dosis) cs.push(comprobarCantidad(dosis.eje, dosis, hechoDeDosis(dosis.eje, t), e.papel, tolerancia(ctx)));
      else if (e.objetivo?.tipo === 'calorias' && e.objetivo.min != null) {
        cs.push(comprobarCantidad('calorias', { valor: e.objetivo.min, max: e.objetivo.max }, hechoDeDosis('calorias', t), e.papel, tolerancia(ctx)));
      }
    }
    if (e.objetivo?.tipo === 'tiempo_tope') cs.push(comprobarTope(e.objetivo.max, t.segundos));
    else if (opts.tope != null && e.papel === 'trabajo') cs.push(comprobarTope(opts.tope, t.segundos));
    if (e.papel === 'recuperacion' && cs.length === 0) return null;
  }
  const rondas = comprobarRondas(t, ctx);
  if (rondas) cs.push(rondas);
  if (llevaHecha([linea.familia])) cs.push(HECHA);
  return filaDeTramo(t, e, cs, { plegado: false, familias: [linea.familia] });
}

/**
 * Un tramo que cubre TODOS los esfuerzos de su línea: se juzgan los totales. Si el
 * registro dice qué trozo de reps tenía delante, se juzga contra ESE (la app graba
 * un 3×12 de core como una vuelta de 12, no de 36).
 */
export function juzgarPlegado(t: TramoEjecutado, esfuerzos: readonly Esfuerzo[], linea: LineaPlan, ctx: ContextoBandas): FilaTramo {
  const trabajo = esfuerzos.filter((e) => e.papel === 'trabajo');
  const cs: Comprobacion[] = [];
  const primero = trabajo[0];
  // La intensidad, solo si todos los esfuerzos de trabajo piden la misma.
  if (primero?.objetivo && trabajo.every((e) => JSON.stringify(e.objetivo) === JSON.stringify(primero.objetivo))) {
    const modalidad = MAQUINAS_O_CORRER.has(t.modalidad ?? '') ? t.modalidad : linea.modalidad;
    const i = comprobarBanda(primero.objetivo, modalidad, (eje) => valorDeTramo(eje, t), ctx, {
      retira: (eje) => eje === 'ritmo' && cuestaRetira(primero, t, ctx),
    });
    if (i) cs.push(i);
  }
  // La dosis total, por el eje que comparten. El tiempo, con los descansos del
  // formato (un EMOM son rondas × minuto, no rondas × trabajo): es lo que dura el tramo.
  const eje = primero?.dosis?.eje ?? null;
  if (eje === 'reps' && t.reps_prescritas != null && t.reps_prescritas > 0) {
    cs.push(comprobarCantidad('reps', { valor: t.reps_prescritas, max: null }, hechoDeDosis('reps', t), 'trabajo', tolerancia(ctx)));
  } else if (eje && trabajo.every((e) => e.dosis?.eje === eje)) {
    let total = trabajo.reduce((a, e) => a + (e.dosis?.valor ?? 0), 0);
    if (eje === 'tiempo' && linea.prescripcion) {
      const d = prescriptionDuration(linea.prescripcion);
      if (d.known) total = d.seconds;
    }
    cs.push(comprobarCantidad(eje, { valor: total, max: null }, hechoDeDosis(eje, t), 'trabajo', tolerancia(ctx)));
  }
  const tope = topeDe(linea.prescripcion);
  if (tope != null) cs.push(comprobarTope(tope, t.segundos));
  const rondas = comprobarRondas(t, ctx);
  if (rondas) cs.push(rondas);
  if (llevaHecha([linea.familia])) cs.push(HECHA);
  const e: Esfuerzo = { papel: 'trabajo', fase: FASE_DE_LINEA[linea.rol], dosis: null, objetivo: null, inclinacion_pct: null, ordinal: null };
  return filaDeTramo(t, e, cs, { plegado: true, familias: [linea.familia] });
}
