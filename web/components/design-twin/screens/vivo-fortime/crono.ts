'use client';

// El crono del bloque, comprimido y pausable. El motor SUBIÓ a `sim.ts` el
// 10-ago, cuando la segunda familia en vivo lo necesitó; aquí queda lo único
// que es de esta pantalla: su compresión.

import { useCronoComprimido, type CronoComprimido } from '../../sim';
import { SIM_X } from './data';

export type CronoSim = CronoComprimido;

export function useCronoSim(): CronoSim {
  return useCronoComprimido(SIM_X);
}
