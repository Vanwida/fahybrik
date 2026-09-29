// EL EMPAREJAMIENTO — qué tramo hecho es qué esfuerzo prescrito (docs/analiticas/
// modelo.md A8). Mismo criterio que el veredicto de carrera del coach
// (`web/lib/dashboard/coach/run-compliance.ts`), generalizado a todas las
// modalidades:
//
//   1. La clave es el ENLACE a la línea (`template_segment_id`): es la misma para
//      un libre y para una sesión del coach, y sin ella no hay prescripción que
//      juzgar (DECISIONS 2026-09-28, «Un libre y uno del coach se leen igual»).
//      Un tramo sin enlace, o enlazado a otra plantilla, no es de este plan:
//      se cuenta aparte (`ajenos`), no se juzga.
//   2. Correr con piernas (`leg_index`, sin ronda) cuyo papel casa con la
//      estructura: cada pierna es el tramo de la estructura en ese índice.
//   3. Grabado serie a serie: una tabla de series.
//   4. Un solo tramo para varios esfuerzos: PLEGADO (los totales).
//   5. Tantos tramos de trabajo como esfuerzos de trabajo: uno a uno, en orden.
//   6. Si no casa, cada tramo contra el esfuerzo representativo — nunca se
//      inventa a qué repetición correspondía. Una pierna de recuperación, contra
//      la primera recuperación prescrita (o no se juzga).
//   7. Un bloque de varios ejercicios (rondas, for time, EMOM, superserie…)
//      grabado en UN tramo que no es pierna cubre a sus hermanas: se juzga como
//      bloque, y ellas salen «cubiertas», no «sin ejecutar».
//   8. Una línea sin tramos está «sin ejecutar» solo si el registro es completo:
//      si la ejecución trae tramos sin enlace, alguno puede ser ella, y se dice
//      «sin detalle» — nunca se acusa de no hacer lo que no se puede comprobar.
//
// Puro y sin base de datos.

import { formatMeta } from '../prescription/format';
import type { ContextoBandas } from './cumplimiento-bandas';
import {
  esfuerzosDeLinea,
  estructuraDe,
  seriesDeLinea,
  topeDe,
  type Esfuerzo,
  type EstadoLinea,
  type FilaLinea,
  type FilaTramo,
  type LineaPlan,
  type TramoEjecutado,
} from './cumplimiento-esfuerzos';
import { juzgarPlegado, juzgarUno } from './cumplimiento-tramo';
import { juzgarBloque, juzgarSeries } from './cumplimiento-series';

export interface ResultadoLineas {
  lineas: FilaLinea[];
  /** Tramos de la ejecución sin enlace a una línea de este plan. */
  ajenos: number;
}

/** ¿Un bloque de este formato puede grabarse entero en un tramo? Los metcon y la superserie. */
function bloquePlegable(formato: string | null): boolean {
  const meta = formatMeta(formato);
  return meta?.family === 'metcon' || formato === 'superset';
}

function filaLinea(l: LineaPlan, estado: EstadoLinea, tramos: FilaTramo[]): FilaLinea {
  return {
    template_segment_id: l.template_segment_id,
    bloque: l.bloque,
    posicion: l.posicion,
    ejercicio: l.ejercicio,
    familia: l.familia,
    rol: l.rol,
    formato: l.formato,
    estado,
    tramos,
  };
}

/**
 * Un tramo que no registró NADA (ni tiempo, ni distancia, ni reps, ni series, ni
 * pulso) y no es una pierna de la estructura: un artefacto de grabación (el motor
 * abrió el paso y avanzó en el acto). No es ni un acierto ni un fallo: no está.
 * Una PIERNA vacía sí cuenta: es el paso que el atleta se saltó.
 */
function tramoVacio(t: TramoEjecutado): boolean {
  const hay = (v: number | null) => v != null && Number.isFinite(v) && v > 0;
  return (
    t.pierna == null &&
    !hay(t.segundos) &&
    !hay(t.metros) &&
    t.reps == null &&
    t.calorias == null &&
    t.kg == null &&
    t.rondas == null &&
    t.pulso_medio == null &&
    t.series.length === 0
  );
}

function noNulas<T>(xs: ReadonlyArray<T | null>): T[] {
  return xs.filter((x): x is T => x != null);
}

/** Los tramos de UNA línea, emparejados con sus esfuerzos (reglas 2-6). */
export function juzgarLinea(l: LineaPlan, tramos: readonly TramoEjecutado[], esfuerzos: readonly Esfuerzo[], ctx: ContextoBandas): FilaTramo[] {
  const ts = [...tramos].sort((a, b) => a.posicion - b.posicion);

  // 3 · serie a serie.
  if (ts.some((t) => t.series.length > 0)) return ts.map((t) => juzgarSeries(t, l, ctx));

  // 2 · piernas de carrera, cuando su papel casa con la estructura en ese índice.
  if (estructuraDe(l) && ts.every((t) => t.pierna != null && (t.ronda ?? 0) === 0)) {
    const casan = ts.every((t) => {
      const e = esfuerzos[t.pierna!];
      if (!e) return true; // fuera de rango: sin esfuerzo, «sin objetivo» honesto
      if (t.papel_pierna === 'work') return e.papel === 'trabajo';
      if (t.papel_pierna === 'recovery') return e.papel === 'recuperacion';
      return true;
    });
    if (casan) return noNulas(ts.map((t) => juzgarUno(t, esfuerzos[t.pierna!] ?? null, l, ctx)));
  }

  const trabajo = esfuerzos.filter((e) => e.papel === 'trabajo');
  const recuperacion = esfuerzos.find((e) => e.papel === 'recuperacion') ?? null;

  // 4 · un tramo, varios esfuerzos: plegado.
  if (ts.length === 1 && trabajo.length > 1 && ts[0]!.papel_pierna !== 'recovery') return [juzgarPlegado(ts[0]!, esfuerzos, l, ctx)];

  const tsTrabajo = ts.filter((t) => t.papel_pierna !== 'recovery');
  const tsRecuperacion = ts.filter((t) => t.papel_pierna === 'recovery');
  const filas: Array<FilaTramo | null> = [];
  // 5 · uno a uno.
  if (trabajo.length > 1 && tsTrabajo.length === trabajo.length) {
    tsTrabajo.forEach((t, i) => filas.push(juzgarUno(t, trabajo[i]!, l, ctx)));
  } else {
    // 6 · contra el representativo: el primer trabajo PRINCIPAL (no el
    // calentamiento de la estructura). Si la línea tiene varios esfuerzos, el
    // tramo no es ninguno en concreto y su dosis no se compara; si tiene uno, el
    // tramo ES la línea — y si su formato puntúa tiempo, se juzga contra su tope.
    const rep = trabajo.find((e) => e.fase === 'principal') ?? trabajo[0] ?? null;
    const unico = trabajo.length <= 1;
    const tope = tsTrabajo.length === 1 && unico ? topeDe(l.prescripcion) : null;
    for (const t of tsTrabajo) filas.push(juzgarUno(t, rep, l, ctx, { tope, sinDosis: !unico }));
  }
  for (const t of tsRecuperacion) filas.push(recuperacion ? juzgarUno(t, recuperacion, l, ctx) : null);
  return noNulas(filas).sort((a, b) => a.posicion - b.posicion);
}

/**
 * El cumplimiento por tramo de UNA sesión: sus líneas del plan frente a los
 * tramos de su ejecución. Sin tramos, todas las líneas salen «sin detalle»
 * (una importación de Salud, un «marcar como hecha»): no hay nada que juzgar
 * tramo a tramo, y no se inventa.
 */
export function cumplimientoDeLineas(lineas: readonly LineaPlan[], tramos: readonly TramoEjecutado[], ctx: ContextoBandas): ResultadoLineas {
  const ordenadas = [...lineas].sort((a, b) => a.bloque - b.bloque || a.posicion - b.posicion);
  if (tramos.length === 0) return { lineas: ordenadas.map((l) => filaLinea(l, 'sin_detalle', [])), ajenos: 0 };

  const ids = new Set(ordenadas.map((l) => l.template_segment_id));
  const porLinea = new Map<string, TramoEjecutado[]>();
  let ajenos = 0;
  for (const t of tramos) {
    if (tramoVacio(t)) continue;
    if (t.template_segment_id == null || !ids.has(t.template_segment_id)) {
      ajenos += 1;
      continue;
    }
    const xs = porLinea.get(t.template_segment_id) ?? [];
    xs.push(t);
    porLinea.set(t.template_segment_id, xs);
  }

  // Ningún tramo enlazado a este plan: no hay nada que juzgar tramo a tramo.
  if (porLinea.size === 0) return { lineas: ordenadas.map((l) => filaLinea(l, 'sin_detalle', [])), ajenos };

  const esfuerzos = new Map(ordenadas.map((l) => [l.template_segment_id, esfuerzosDeLinea(l)] as const));
  const bloques = new Map<number, LineaPlan[]>();
  for (const l of ordenadas) bloques.set(l.bloque, [...(bloques.get(l.bloque) ?? []), l]);

  const out: FilaLinea[] = [];
  for (const lineasBloque of bloques.values()) {
    const conTramos = lineasBloque.filter((l) => (porLinea.get(l.template_segment_id)?.length ?? 0) > 0);
    // 7 · el bloque grabado entero: UNA sola de sus líneas lleva tramos, y no son
    // piernas. Si dos o más líneas traen los suyos, se grabó línea a línea y la que
    // falta está sin ejecutar. En una tabla de series la prueba es el recuento: el
    // bloque entero trae más series que las de su línea.
    const unica = conTramos.length === 1 ? conTramos[0]! : null;
    const tsUnica = unica ? porLinea.get(unica.template_segment_id)! : [];
    const seriesDeMas = (x: TramoEjecutado) => x.series.length === 0 || x.series.length > seriesDeLinea(unica!).porRonda.length;
    const plegado =
      unica != null &&
      lineasBloque.length > 1 &&
      bloquePlegable(lineasBloque[0]!.formato) &&
      tsUnica.every((t) => t.pierna == null && seriesDeMas(t));
    for (const l of lineasBloque) {
      const ts = porLinea.get(l.template_segment_id) ?? [];
      if (ts.length === 0) {
        out.push(filaLinea(l, plegado ? 'cubierta' : ajenos > 0 ? 'sin_detalle' : 'sin_ejecutar', []));
        continue;
      }
      const filas = plegado
        ? ts.map((t) => juzgarBloque(t, lineasBloque, ctx))
        : juzgarLinea(l, ts, esfuerzos.get(l.template_segment_id) ?? [], ctx);
      out.push(filaLinea(l, 'ejecutada', filas));
    }
  }
  return { lineas: out, ajenos };
}
