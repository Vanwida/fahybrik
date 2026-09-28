// LA TAREA DEL WOD EN PALABRAS — funciones PURAS sobre `PasoBase.wod` (P12, M5).
//
// Notación de pizarra, en un sitio: «6 Bench Press · 60 kg», «500 m Row»,
// «Row · todo el minuto». Y la puntuación del AMRAP que se dice con la corona
// en la campana (rondas + reps, con el acarreo de las reps a la ronda).

import { fmtDuracion, fmtPrescrito, num } from './reglas';
import type { InfoWod, PasoBase, Tarea } from './paso';

/** La info del WOD de un paso, si la tiene. */
export const wodDe = (p: PasoBase | null | undefined): InfoWod | undefined => p?.wod;

const kg = (t: Tarea) => (t.carga ? `${t.carga.implementos ? `${t.carga.implementos} × ` : ''}${num(t.carga.kg)} kg` : null);

/** La carga o su ausencia declarada: «9 kg», «peso corporal», o nada. */
export function cargaTarea(t: Tarea): string | null {
  return kg(t) ?? (t.corporal ? 'peso corporal' : null);
}

/** «6 Bench Press · 60 kg», «500 m Row», «10 Burpee», «Row · todo el minuto». */
export function textoTarea(t: Tarea, ventanaS?: number): string {
  if (!t.dosis || t.dosis.tipo === 'abierta') {
    const todo = ventanaS === 60 ? 'todo el minuto' : 'todo el intervalo';
    return ventanaS ? `${t.nombre} · ${todo}` : t.nombre;
  }
  const pr = t.dosis.tipo === 'reps' ? String(t.dosis.prescrito) : fmtPrescrito(t.dosis);
  return [`${pr} ${t.nombre}`, kg(t)].filter(Boolean).join(' · ');
}

/** Lo mismo, en corto para «Luego ·»: la ventana entera es su duración («Row · 1′»). */
export function textoTareaCorto(t: Tarea, ventanaS?: number): string {
  if ((!t.dosis || t.dosis.tipo === 'abierta') && ventanaS) return `${t.nombre}${t.corre ? ' en cinta' : ''} · ${fmtDuracion(ventanaS)}`;
  return textoTarea(t);
}

/** La dosis sin el nombre: «6 reps · 60 kg», «500 m»; `null` si es la ventana entera. */
export function dosisTarea(t: Tarea): string | null {
  if (!t.dosis || t.dosis.tipo === 'abierta') return null;
  return [fmtPrescrito(t.dosis), cargaTarea(t)].filter(Boolean).join(' · ');
}

/**
 * Lo que una tarea cuenta en la puntuación de una ronda a medias: sus reps o
 * sus calorías; una tarea por distancia (250 m Row) cuenta UNA al completarla
 * (no 250 «reps»); la ventana entera, nada. Decisión del 28-09 (AMRAP con
 * remo): antes sumaba los metros como si fueran reps.
 */
export function repsDeTarea(t: Tarea): number {
  if (!t.dosis || t.dosis.tipo === 'abierta' || t.dosis.tipo === 'tiempo') return 0;
  if (t.dosis.tipo === 'distancia') return 1;
  return t.dosis.prescrito ?? 0;
}

/** Reps de una ronda entera del AMRAP (12 + 10 + 8 = 30). */
export const repsPorRonda = (tareas: Tarea[]) => tareas.reduce((a, t) => a + repsDeTarea(t), 0);

// ---------------------------------------------------------------------------
// La puntuación del AMRAP, dicha con la corona en la campana
// ---------------------------------------------------------------------------

export interface Dial {
  rondas: number;
  /** Reps sueltas (con rondas) o reps totales; `null` = sin declarar, nunca 0. */
  reps: number | null;
}

/**
 * Un paso de corona sobre la puntuación. `mas` = +1 o −1 (arriba es «más»,
 * como el selector de watchOS). Con rondas, las reps sueltas llevan: pasar de
 * 29 a 30 en una ronda de 30 es una ronda más. Desde «—» el primer paso
 * arriba es 1 y abajo es 0 (lo que se dice, se dice).
 */
export function girarDial(d: Dial, mas: 1 | -1, porRonda: number): Dial {
  let { rondas, reps } = d;
  if (reps == null) reps = mas > 0 ? 1 : 0;
  else reps += mas;
  if (porRonda > 0 && reps >= porRonda) {
    rondas += 1;
    reps -= porRonda;
  } else if (porRonda > 0 && reps < 0 && rondas > 0) {
    rondas -= 1;
    reps += porRonda;
  }
  return { rondas, reps: Math.max(0, reps) };
}

/**
 * La puntuación tocada en el móvil (28-09): el dato enfocado (`rondas` o
 * `reps`) se mueve `delta` de golpe (varios toques seguidos se suman). Las
 * reps llevan a la ronda como en la corona; las rondas nunca bajan de 0 y
 * desde «—» el primer toque es 1.
 */
export function girarPuntuacion(d: Dial, campo: 'rondas' | 'reps', delta: number, porRonda: number): Dial {
  if (campo === 'rondas') return { rondas: Math.max(0, d.rondas + delta), reps: d.reps };
  let r = d;
  const pasos = Math.abs(delta);
  for (let k = 0; k < pasos; k++) r = girarDial(r, delta > 0 ? 1 : -1, porRonda);
  return r;
}

/** 18 reps de una ronda 12/10/8 → «12 Wall Ball + 6 KB Swing»: dónde te quedaste. Una tarea por distancia cuenta 1 («Row»). */
export function desgloseReps(tareas: Tarea[], reps: number): string {
  const partes: string[] = [];
  let resto = reps;
  for (const t of tareas) {
    if (resto <= 0) break;
    const cuenta = repsDeTarea(t);
    const n = Math.min(resto, cuenta);
    partes.push(t.dosis?.tipo === 'distancia' ? t.nombre : `${n} ${t.nombre}`);
    resto -= n;
  }
  return partes.join(' + ');
}
