// CUÁNTO DURA UN PASO — la estimación que el aro dibuja y la cabecera del plan
// compacto (`duracionEstS`) resume. Compartida con el servidor; `kit-reloj/
// estructura.ts` la re-exporta.

import type { PasoBase } from './paso';
import { principal } from './texto';

/** Ritmo neutro para repartir el perímetro cuando un paso de correr no trae ritmo. Solo dibuja. */
const RITMO_DIBUJO_S_KM = 300;
/** /500 neutro de un ergómetro sin objetivo de /500. Solo dibuja. */
const SPLIT_DIBUJO_S = 120;
/** Lo que se dibuja de un paso que nadie cronometra ni mide a ritmo (reps, un trineo). */
const PASO_NEUTRO_S = 60;

/**
 * Cuánto dura un paso, estimado, para darle su parte del perímetro. Un paso
 * por metros solo se estima a ritmo de carrera si SE CORRE (GPS o cinta): un
 * trineo de 50 m a 5:00/km se dibujaría de 15 s. Un ergómetro, a su /500.
 */
export function duracionEstimada(p: PasoBase): number {
  const pr = p.medida.prescrito ?? 0;
  if (p.medida.tipo === 'tiempo') return pr;
  if (p.medida.tipo !== 'distancia') return PASO_NEUTRO_S;
  const o = principal(p);
  if (p.medida.mide === 'gps' || p.medida.mide === 'cinta') {
    const ritmo = o?.eje === 'ritmo' && o.min != null && o.max != null ? (o.min + o.max) / 2 : RITMO_DIBUJO_S_KM;
    return (pr / 1000) * ritmo;
  }
  if (p.medida.mide === 'ergo') {
    const split = o?.eje === 'split500' && o.min != null && o.max != null ? (o.min + o.max) / 2 : SPLIT_DIBUJO_S;
    return (pr / 500) * split;
  }
  return PASO_NEUTRO_S;
}
