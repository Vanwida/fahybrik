// LOS BOTONES DE DESPUÉS — qué hace y qué dice cada uno en cada pantalla. PURO.
//
// §5 tiene UNA fila para todo lo de después («RPE / Resumen»): START confirma /
// siguiente, BACK atrás, UP valor +, DOWN valor −. Esa fila es del RPE (hay un
// valor que mover); en el resto de pantallas de después no lo hay, y rotular un
// «+» y un «−» donde no mueven nada era el fallo que el kit dejó en «Sesión
// completada». Aquí cada pantalla dice lo que sus cinco teclas hacen de verdad,
// SIN inventar ninguna acción: todo botón responde con una acción de esa fila
// de §5 (`confirmar`, `atras`, `valor-mas`, `valor-menos`) o, en las páginas del
// resumen, con las de UP y DOWN de «Paso en curso» (`pagina-anterior`,
// `pagina-siguiente`); y el que no hace nada ahí no se rotula.
//
//   decide     G27 antes de guardar     START Guardar · BACK Seguir · UP DOWN —
//   guardada   G27 ya guardada          START Siguiente · el resto —
//   rpe        G28                      UP + · DOWN − · START Confirmar (con valor) · BACK Saltar
//   pagina     G29–G31                  UP DOWN página · START Siguiente (Listo en la última) ·
//                                       BACK Atrás; en un rechazo, START Reintentar · BACK Guardar en el reloj
//
// HUECO DEL MODELO: §5 debería partir su fila en «RPE» y «Resumen» (el resumen
// se recorre con UP y DOWN como páginas, no como valor). Hasta entonces la
// tabla del kit (`MANDOS.resumen`) sigue siendo la del RPE y esta capa la afina.
//
// Qué NO hacer: añadir una acción que §5 no tenga; rotular un botón que no hace
// nada; resolver una tecla fuera de esta tabla.

import { MANDOS, type BotonGarmin, type Mando } from '../../kit-garmin';

export type PantallaFin =
  | { tipo: 'decide' }
  | { tipo: 'guardada' }
  | { tipo: 'rpe'; conValor: boolean }
  /** `n` de `de` (0-based); `rechazo`: la página del envío con un rechazo (START y BACK deciden). */
  | { tipo: 'pagina'; n: number; de: number; rechazo: boolean }
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
      if (b === 'start') return p.conValor ? con(R.start, 'Confirmar') : null;
      if (b === 'back') return con(R.back, 'Saltar');
      return b === 'up' ? R.up : R.down;
    case 'pagina':
      if (b === 'start') return con(R.start, p.rechazo ? 'Reintentar' : p.n === p.de - 1 ? 'Listo' : 'Siguiente');
      if (b === 'back') return p.rechazo ? con(R.back, 'Guardar en el reloj') : p.n > 0 ? con(R.back, 'Atrás') : null;
      return b === 'up' ? MANDOS.paso.up : MANDOS.paso.down;
    case 'salida':
      return null;
  }
}

/** Lo que la carcasa pide: `mandoDe` de una pantalla, como función de botón. */
export const mandosDe = (p: PantallaFin) => (b: BotonGarmin, porTabla: Mando | null) => mandoDe(p, b, porTabla);
