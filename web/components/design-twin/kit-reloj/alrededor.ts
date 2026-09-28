// LO DE ALREDEDOR DEL PASO — funciones PURAS (familia WOD del iPhone, 28-09).
//
// Un chipper de diez estaciones o un HYROX de dieciséis piezas no caben en
// el vivo como lista: el vivo de hoy desbordaba la pantalla con «EL ENTRENO
// 1 de 10». La regla: se enseña lo que acabas de hacer (con su tiempo), lo
// que viene, y cuántas quedan («+7 más»); la lista entera vive en la página
// Estructura. La estación de AHORA no va en la lista: es la fila del trabajo.

import type { Parcial, PasoBase } from './paso';
import { textoPasoCorto } from './reglas';
import { textoTarea, wodDe } from './tarea';

export interface AlrededorVista {
  /** El paso de trabajo anterior y cuánto tardó (su parcial), si lo hay. */
  anterior: { paso: PasoBase; segundos: number | null } | null;
  /** El siguiente paso de trabajo, si lo hay. */
  siguiente: PasoBase | null;
  /** Cuántos pasos de trabajo hay ANTES del anterior (ya hechos y fuera de la ventana). */
  masAtras: number;
  /** Cuántos pasos de trabajo hay DESPUÉS del siguiente («+7 más»). */
  masAdelante: number;
}

/**
 * La ventana ±1 alrededor del paso `i`: el anterior de trabajo con su parcial,
 * el siguiente de trabajo, y cuántos quedan a cada lado. Recuperaciones y
 * transiciones no cuentan como estación.
 */
export function alrededorDe(pasos: ReadonlyArray<PasoBase>, i: number, parciales: ReadonlyArray<Parcial>): AlrededorVista {
  const trabajo = (p: PasoBase | undefined) => !!p && p.rol === 'trabajo';
  let iAnt = i - 1;
  while (iAnt >= 0 && !trabajo(pasos[iAnt])) iAnt--;
  let iSig = i + 1;
  while (iSig < pasos.length && !trabajo(pasos[iSig])) iSig++;
  const anterior = iAnt >= 0 ? { paso: pasos[iAnt]!, segundos: parciales.find((x) => x.i === iAnt)?.segundos ?? null } : null;
  const siguiente = iSig < pasos.length ? pasos[iSig]! : null;
  const masAtras = iAnt > 0 ? pasos.slice(0, iAnt).filter(trabajo).length : 0;
  const masAdelante = siguiente ? pasos.slice(iSig + 1).filter(trabajo).length : 0;
  return { anterior, siguiente, masAtras, masAdelante };
}

/**
 * Una estación en una línea: «40 Wall Ball · 9 kg», «30 cal Row», «Run · 800 m».
 * La de un WOD sale de su tarea. `conCarga: false` la deja sin kilos (la fila
 * de lo ya hecho, que lleva su tiempo al lado y no cabe con todo a 390 pt).
 */
export function textoEstacion(p: PasoBase, conCarga = true): string {
  const w = wodDe(p);
  if (w?.formato === 'fortime' && w.tarea) return textoTarea(conCarga ? w.tarea : { ...w.tarea, carga: undefined });
  if (w?.formato === 'emom') return textoTarea(conCarga ? w.tarea : { ...w.tarea, carga: undefined }, w.ventanaS);
  // El resto (una carrera dentro del chipper, una estación de circuito): el paso en corto, con su carga.
  return textoPasoCorto(conCarga ? p : { ...p, carga: undefined });
}
