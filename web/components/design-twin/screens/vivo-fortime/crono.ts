'use client';

// El crono del bloque, comprimido y pausable. Vive aquí y no dentro de cada
// escena porque las dos lo necesitan igual, y un segundo reloj escrito «solo
// para esta pantalla» es exactamente lo que el CONTRATO-UI §2 vino a cortar.

import { useCallback, useState } from 'react';
import { useTicker } from '../../sim';
import { SIM_X } from './data';

export interface CronoSim {
  /** Segundos SIMULADOS desde que se abrió la escena. */
  t: number;
  pausado: boolean;
  alternarPausa: () => void;
}

/**
 * `useTicker` cuenta desde que arranca, así que al reanudar hay que sumar lo
 * acumulado antes o el crono retrocedería. En un For Time el crono es la
 * puntuación: no puede perder un segundo por una pausa.
 */
export function useCronoSim(): CronoSim {
  const [base, setBase] = useState(0);
  const [tick, setTick] = useState(0);
  const [corriendo, setCorriendo] = useState(true);

  useTicker(corriendo, (s) => setTick(s * SIM_X));

  const alternarPausa = useCallback(() => {
    setCorriendo((c) => {
      if (c) {
        setBase((b) => b + tick);
        setTick(0);
      }
      return !c;
    });
  }, [tick]);

  return { t: base + tick, pausado: !corriendo, alternarPausa };
}
