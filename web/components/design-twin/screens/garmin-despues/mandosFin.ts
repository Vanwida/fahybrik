// LOS BOTONES DE DESPUÉS — qué hace y qué dice cada uno en cada pantalla. PURO.
//
// §5 tiene DOS filas para lo de después: «RPE» (hay un valor que mover: UP +, DOWN
// −, START confirma, BACK omite) y «Resumen» (las páginas se recorren: UP y DOWN
// página, START siguiente o Hecho, BACK atrás o Seguir). Cada pantalla dice lo que
// sus cinco teclas hacen de verdad SIN inventar ninguna acción: todo botón responde
// con una celda de esas filas, y el que no hace nada ahí no se rotula (nunca un «+» y
// un «−» donde no mueven nada, ni un «Siguiente» en la última página).
//
//   decide     G27 antes de guardar     START Guardar · BACK Seguir · UP DOWN —
//   guardada   G27 ya guardada          START Siguiente · el resto —
//   rpe        G28                      UP + · DOWN − · START Confirmar (con valor) · BACK Omitir
//   pagina     G29–G31                  UP DOWN página · START Siguiente (Listo en la última) ·
//                                       BACK Atrás (nada en la primera)
//
// Qué NO hacer: añadir una acción que §5 no tenga; rotular un botón que no hace
// nada; resolver una tecla fuera de esta tabla.

import { MANDOS, type BotonGarmin, type Mando } from '../../kit-garmin';

export type PantallaFin =
  | { tipo: 'decide' }
  | { tipo: 'guardada' }
  | { tipo: 'rpe'; conValor: boolean }
  /** `n` de `de` (0-based). */
  | { tipo: 'pagina'; n: number; de: number }
  /** Ya salió de la app: ningún botón hace nada. */
  | { tipo: 'salida' };

const R = MANDOS.resumen;
const con = (base: Mando | null, rotulo: string): Mando => ({ ...base!, rotulo });

/** La celda de un botón en una pantalla de después (`null` = no hace nada ahí). */
export function mandoDe(p: PantallaFin, b: BotonGarmin, porTabla: Mando | null): Mando | null {
  // LIGHT es del sistema y UP largo no existe en el resumen (§5): tal como dice la tabla.
  if (b === 'light' || b === 'upLargo') return porTabla;
  switch (p.tipo) {
    case 'decide':
      return b === 'start' ? con(R.start, 'Guardar') : b === 'back' ? con(R.back, 'Seguir') : null;
    case 'guardada':
      return b === 'start' ? con(R.start, 'Siguiente') : null;
    case 'rpe':
      // START confirma un valor: sin valor no hay nada que confirmar. UP, DOWN y BACK son los de la fila «RPE».
      return b === 'start' && !p.conValor ? null : porTabla;
    case 'pagina':
      if (b === 'start') return con(R.start, p.n === p.de - 1 ? 'Listo' : 'Siguiente');
      if (b === 'back') return p.n > 0 ? con(R.back, 'Atrás') : null;
      return b === 'up' ? R.up : R.down;
    case 'salida':
      return null;
  }
}

/** Lo que la carcasa pide: `mandoDe` de una pantalla, como función de botón. */
export const mandosDe = (p: PantallaFin) => (b: BotonGarmin, porTabla: Mando | null) => mandoDe(p, b, porTabla);
