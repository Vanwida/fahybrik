// LOS CONTROLES Y LA FILA DE §5 QUE DICE EL PASO — datos y decisiones PURAS del vivo.
//
//   IdControl · TEXTO_CONTROL · ENTORNOS   lo que ofrece el menú de UP largo (§5)
//   estadoDelPaso(paso)                    la fila de §5 que dice el paso mismo (un AMRAP,
//                                          un Tabata, fuerza, una recuperación)
//   controlesPorDefecto(seq, estado)       Pausa, Saltar paso, +30 s (solo en descanso),
//                                          Cambiar entorno (solo si se corre de verdad),
//                                          Terminar, Descartar; y Datos, Rondas y Estructura
//                                          donde UP/DOWN cuentan reps
//
// Qué NO hacer: añadir un control sin su texto; ofrecer «Cambiar entorno» en una sesión
// que no corre (un Tabata, una serie de fuerza).

import { wodDe } from '../kit-reloj';
import { esFuerza } from '../kit-reloj/fuerza';
import type { Secuencia } from '../kit-reloj/gancho';
import type { Entorno, Paso, PasoBase } from '../kit-reloj/paso';
import type { EstadoMandos } from './mandos';
import { seCorreDeVerdad } from './pantalla';

export type IdControl = 'pausa' | 'saltar' | 'mas30' | 'entorno' | 'terminar' | 'descartar' | 'datos' | 'vueltas' | 'estructura';

export const TEXTO_CONTROL: Record<IdControl, string> = {
  pausa: 'Pausa',
  saltar: 'Saltar paso',
  mas30: '+30 s',
  entorno: 'Cambiar entorno',
  terminar: 'Terminar',
  descartar: 'Descartar',
  datos: 'Datos',
  vueltas: 'Vueltas',
  estructura: 'Estructura',
};

export const ENTORNOS: Array<{ id: Entorno; texto: string }> = [
  { id: 'calle', texto: 'Calle' },
  { id: 'cinta', texto: 'Cinta' },
  { id: 'pista', texto: 'Pista' },
];

/** El estado de §5 que dice el paso mismo (sin los 5 s de deshacer ni la pausa): lo que el kit sabe de un AMRAP, un Tabata, fuerza o una recuperación. */
export function estadoDelPaso(paso: PasoBase): EstadoMandos {
  const w = wodDe(paso);
  if (w?.formato === 'puntuacion') return 'campana';
  if (w?.formato === 'amrap') return w.tareas.length > 1 ? 'amrap' : 'ventana';
  if (w?.formato === 'pared') return 'ventana';
  if (paso.rol !== 'trabajo') return 'recupera';
  return esFuerza(paso) ? 'fuerza' : 'paso';
}

/** ¿Cuentan UP y DOWN reps? El AMRAP de varios movimientos, su campana y el AMRAP de UNO (`ventana` + AMRAP). */
const cuentaReps = (base: EstadoMandos, paso: Paso): boolean => base === 'amrap' || base === 'campana' || (base === 'ventana' && wodDe(paso)?.formato === 'amrap');

/**
 * Los Controles de §5: Pausa, Saltar paso, +30 s (solo en descanso), Cambiar
 * entorno (solo si se corre de verdad: una ronda de Tabata o una serie no son
 * correr), Terminar, Descartar. Donde UP/DOWN cuentan reps, también Datos,
 * Rondas y Estructura.
 */
export function controlesPorDefecto(seq: Secuencia, base: EstadoMandos): IdControl[] {
  const c: IdControl[] = ['pausa'];
  if (cuentaReps(base, seq.paso)) c.push('datos', 'vueltas', 'estructura');
  c.push('saltar');
  if (seq.paso.rol === 'recuperacion' || seq.paso.rol === 'descanso') c.push('mas30');
  if (seq.plan.pasos.some(seCorreDeVerdad)) c.push('entorno');
  c.push('terminar', 'descartar');
  return c;
}
