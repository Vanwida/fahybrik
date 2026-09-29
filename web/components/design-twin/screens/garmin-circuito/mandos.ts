// EL AVISO DE CIERRE DEL CIRCUITO. PURO.
//
// Qué botón hace qué lo dice `MANDOS` (§5) según el estado, y el estado lo
// deduce el kit (`estadoDelPaso`): el AMRAP de un movimiento dentro de un
// chipper es la fila `ventana` (BACK/LAP sin efecto; UP/DOWN cuentan reps) y su
// campana la fila `campana` (START guarda con 5 s de deshacer), las MISMAS que en
// `garmin-wod`. Aquí solo queda lo que dice el aviso de deshacer.
//
// Qué NO hacer: resolver una tecla aquí con un `if` (se cambia el estado, no la
// tecla); dar a BACK una acción que cierre la app grabando.

import { AVISO_RELEVO, esRelevo } from '../../kit-reloj/dobles';
import type { Paso } from '../../kit-reloj/paso';
import type { Circuito } from '../reloj-circuito/planes';
import { avisoDe } from '../reloj-circuito/texto';

/** Lo que dice el aviso de deshacer: el del relevo (dobles) o el del circuito («Run 3 cerrado», «Sled Push hecho»). */
export const avisoCierreC = (p: Paso, c: Circuito): string => (esRelevo(p) ? AVISO_RELEVO : avisoDe(p, c));
