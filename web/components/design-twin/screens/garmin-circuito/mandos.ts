// LOS BOTONES DEL CIRCUITO — §5 del modelo, sin un `if` propio por tecla.
//
// La tabla de `MANDOS` (kit-garmin) dice qué hace cada botón en cada estado;
// una familia solo dice EN QUÉ ESTADO está. El circuito pide dos cambios:
//
//   · la campana de un AMRAP (dentro de un chipper): el atleta DICE las reps.
//     Es `anotar` (§5: START confirma, UP/DOWN mueven el valor), no `amrap`:
//     en un AMRAP de un solo movimiento no hay «ronda hecha» que cerrar.
//   · el AMRAP mismo (la ventana): nada que contar en vivo (las reps se dicen
//     en la campana), así que es un paso como los demás: BACK/LAP lo cierra
//     con su deshacer y UP/DOWN pasan página. Con `amrap`, UP/DOWN contarían
//     reps y las páginas quedarían escondidas tras Controles.
//
// Durante los 5 s de deshacer manda `deshacer` (UP deshace), siempre.
//
// Qué NO hacer: resolver una tecla aquí con un `if` (se cambia el estado, no
// la tecla); dar a BACK una acción que cierre la app grabando.

import type { EstadoMandos } from '../../kit-garmin';
import { AVISO_RELEVO, esRelevo } from '../../kit-reloj/dobles';
import type { Paso, PasoBase } from '../../kit-reloj/paso';
import { esPuntuacion, type Circuito } from '../reloj-circuito/planes';
import { avisoDe } from '../reloj-circuito/texto';

/** En qué estado de §5 está el reloj en un paso del circuito. `base` es el que deriva el kit. */
export function estadoMandosC(paso: PasoBase, base: EstadoMandos): EstadoMandos {
  if (base === 'deshacer') return base;
  if (esPuntuacion(paso)) return 'anotar';
  if (paso.wod?.formato === 'amrap') return 'paso';
  return base;
}

/** Lo que dice el aviso de deshacer: el del relevo (dobles) o el del circuito («Run 3 cerrado», «Sled Push hecho»). */
export const avisoCierreC = (p: Paso, c: Circuito): string => (esRelevo(p) ? AVISO_RELEVO : avisoDe(p, c));
