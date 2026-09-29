// LOS CASOS DE LA GRAMÁTICA GARMIN — los mismos de «Muñeca · correr»
// (`reloj-correr/casos.ts` y `planes.ts`): el mismo plan, el mismo cuerpo y el
// mismo punto de partida, pintados por otro reloj. Un estado, dos pintores:
// si aquí algo se ve distinto que en la muñeca, es el pintor, no el dato.
//
// Solo se añade lo que la muñeca no tenía como escenario: el descanso de la
// 479 (entre Wall Balls), el final natural de la 6 × 1000 m y los botones
// guionizados del deshacer.

import type { BotonGarmin, Diametro } from '../../kit-garmin';
import { casoDe, cuerpo, serie, type CasoCorrer } from '../reloj-correr/casos';
import { seisPorMil, sesion479 } from '../reloj-correr/planes';

export interface CasoGarmin {
  caso: CasoCorrer;
  inicial?: { tamano?: Diametro; controles?: boolean };
  guion?: Array<{ en: number; boton: BotonGarmin }>;
  /** Los cuatro tamaños a la vez, con el motor quieto. */
  comparar?: boolean;
}

/** Las seis series de 1000 m ya corridas (la vuelta a la calma de la 6 × 1000). */
const SEIS_HECHAS = [231, 228, 229, 230, 227, 232].map((s, k) => serie(k + 1, s, 1000, 169 + k));
/** Las seis de 800 m a Z5 de la 479, ya corridas (el descanso de los Wall Balls). */
const SEIS_Z5 = [168, 166, 167, 165, 169, 166].map((s, k) => serie(k + 1, s, 800, 175 + (k % 2), 'zona'));

/** Índices de la 479: la primera recuperación de los Wall Balls (tras el WB 1/5) es el paso 13. */
const DESCANSO_WB_479 = 13;
/** La vuelta a la calma de la 6 × 1000 es el último paso (12) y dura 10′. */
const VUELTA_CALMA_6X1000 = 12;

export function casoGarmin(escenario: string): CasoGarmin {
  switch (escenario) {
    case 'ritmo-fuera':
      return { caso: casoDe('serie-rapida') };
    case 'zona':
      return { caso: casoDe('serie-z5') };
    case 'rodaje':
      return { caso: casoDe('rodaje-z2') };
    case 'tirada-km':
      return { caso: casoDe('tirada-z2') };
    case 'recupera-go':
      return { caso: casoDe('recupera-go') };
    case 'descanso':
      return {
        caso: {
          datos: sesion479(),
          sim: cuerpo({ partida: { i: DESCANSO_WB_479, t: 44 } }),
          inicio: { i: DESCANSO_WB_479, t: 44, sesionT: 1702, sesionM: 6590, vueltas: SEIS_Z5, ppmMedio: 157 },
        },
      };
    case 'deshacer':
      // BACK/LAP a los 2,5 s (la serie se cierra y entra la recuperación);
      // UP a los 5,5 s, dentro de los 5 s: se deshace y vuelve la serie.
      return {
        caso: casoDe('serie-dentro'),
        guion: [
          { en: 2500, boton: 'back' },
          { en: 5500, boton: 'up' },
        ],
      };
    case 'controles':
      return { caso: casoDe('serie-dentro'), inicial: { controles: true } };
    case 'pausa': {
      const c = casoDe('serie-dentro');
      return { caso: { ...c, inicio: { ...c.inicio, pausado: true } } };
    }
    case 'completada':
      return {
        caso: {
          datos: seisPorMil(),
          sim: cuerpo({ partida: { i: VUELTA_CALMA_6X1000, t: 592 } }),
          inicio: { i: VUELTA_CALMA_6X1000, t: 592, sesionT: 3322, sesionM: 11590, vueltas: SEIS_HECHAS, ppmMedio: 151 },
        },
      };
    case 'tamanos':
      return { caso: casoDe('serie-dentro'), comparar: true };
    case 'tamanos-zona':
      return { caso: casoDe('serie-z5'), comparar: true };
    case 'ritmo-dentro':
    default:
      return { caso: casoDe('serie-dentro') };
  }
}
