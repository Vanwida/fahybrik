// LOS DOBLES EN EL VIVO — el turno de cada estación, como DATO del paso.
// Espejo de `ios/FAHYBRIKCore/Vivo/Vivo+Dobles.swift`.
//
// El motor decide quién hace cada estación (toda tuya, toda de tu pareja o
// repartida por reps); el vivo lo LEE y lo pinta con la anatomía de siempre: el
// turno y la pareja en la fila del formato de la cabecera, en la espera lo que
// llevas esperando (nadie mide a tu pareja: `screens/watch-dobles/guion.ts`) y la
// primaria «Relevo», que declara SIEMPRE el atleta. En una estación repartida la
// dosis del paso es TU parte, no la estación entera.

import type { PasoBase } from './paso';
import { fmtReloj } from './reglas';

export type TurnoDobles = 'tuyo' | 'pareja' | 'reparto';

export interface Dobles {
  turno: TurnoDobles;
  /** El nombre de pila de la pareja. Sin él → «tu pareja» (nunca se inventa). */
  pareja?: string;
  /** La estación tal como la nombra el coach («SkiErg 1km»). */
  estacion: string;
  /** Tus reps y las suyas, solo si la estación tiene un total de reps. */
  tuyas?: number;
  suyas?: number;
  /** Tu parte, 0…100. */
  pctTuyo: number;
  /** El pacto del coach («alterna 250m»). */
  nota?: string;
}

export const nombrePareja = (d: Dobles) => d.pareja ?? 'tu pareja';

/** ¿Es la estación de la pareja (esperas y das el relevo)? */
export const esRelevo = (p: Pick<PasoBase, 'dobles'>) => p.dobles?.turno === 'pareja';

export function textoTurno(d: Dobles): string {
  if (d.turno === 'tuyo') return 'te toca';
  if (d.turno === 'pareja') return `le toca a ${nombrePareja(d)}`;
  return `con ${nombrePareja(d)}`;
}

/** La parte de la cabecera que dice el turno: «Dobles · le toca a Marta». */
export const formatoDobles = (d: Dobles) => `Dobles · ${textoTurno(d)}`;

/** El pacto de una estación repartida («Tú 60 · Marta 40 · alterna 25»); null fuera de un reparto. */
export function pactoDe(d: Dobles): string | null {
  if (d.turno !== 'reparto') return null;
  const q = nombrePareja(d);
  const quien = q.charAt(0).toUpperCase() + q.slice(1);
  const partes =
    d.tuyas != null && d.suyas != null ? [`Tú ${d.tuyas}`, `${quien} ${d.suyas}`] : [`Tú ${d.pctTuyo} %`, `${quien} ${100 - d.pctTuyo} %`];
  if (d.nota) partes.push(d.nota);
  return partes.join(' · ');
}

/** El héroe de la espera: lo que llevas esperando. Tu salida no se estima. */
export const heroeRelevo = (t: number) => ({ clase: 'crono' as const, texto: fmtReloj(t), etiqueta: 'recuperas' });

/** La nota de honestidad bajo el héroe de la espera. */
export const NOTA_RELEVO = 'el relevo lo dices tú';

/** El aviso de deshacer del relevo. */
export const AVISO_RELEVO = 'Relevo · entras tú';
