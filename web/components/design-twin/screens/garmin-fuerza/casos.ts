// LOS CASOS DE «GARMIN · FUERZA» — los planes, el cuerpo y el punto de partida
// son los de «Muñeca · fuerza» (`reloj-fuerza/casos.ts` y `planes.ts`): las
// mismas sesiones reales (529, 488, 492, 538) y el ejemplo literal de P11. Lo
// único propio es el GUION: en Garmin no hay doble toque ni corona, así que cada
// gesto de la muñeca pasa a su botón de §5, por el MISMO camino que la tecla.
//
// Tiempos de los guiones: tras cerrar una serie con BACK/LAP viven 5 s de
// deshacer (UP deshace) y los botones aún no son los de la anotación; por eso
// la primera pulsación de anotar va siempre pasados esos 5 s.

import type { BotonGarmin, Diametro } from '../../kit-garmin';
import type { InicioSecuencia, PlanSesion, Registro, Simulador } from '../../kit-reloj';
import { casoDe, cuerpo, inicioEn } from '../reloj-fuerza/casos';
import { ejercicio, indiceDe, plan as planDe, rir, sesion488, type DefEjercicio } from '../reloj-fuerza/planes';

export interface CasoGarminFuerza {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  /** Lo ya declarado antes de que arranque el escenario. */
  registro: Registro;
  guion?: Array<{ en: number; boton: BotonGarmin }>;
  inicial?: { tamano?: Diametro; pagina?: number; controles?: boolean };
}

const reps = (n: number, kg?: number, esfuerzo?: number) => ({ reps: n, ...(kg != null ? { kg } : {}), ...(esfuerzo != null ? { esfuerzo } : {}) });

/** Una lista de pulsaciones con su hora (ms desde que arranca el escenario). */
const pulsa = (...x: Array<[number, BotonGarmin]>): CasoGarminFuerza['guion'] => x.map(([en, boton]) => ({ en, boton }));

/** De una escena de la muñeca, su plan, su cuerpo y su punto de partida; el guion es de botones. */
function deLaMuneca(id: string, guion?: CasoGarminFuerza['guion'], inicial?: CasoGarminFuerza['inicial']): CasoGarminFuerza {
  const c = casoDe(id);
  return { plan: c.plan, sim: c.sim, inicio: c.inicio, registro: c.registro, guion, inicial };
}

/**
 * El ejemplo literal del modelo (P11) «5 × 100 kg · RIR 2 · 3-1-1», pero con las
 * reps que dice el atleta: aquí nadie las cuenta (el conteo por movimiento es
 * fase 2, prueba T10), y por eso el héroe es el crono de la serie (G7).
 */
export function ejemploDeclarado(): PlanSesion {
  const bs: DefEjercicio = {
    clave: 'p11-bs',
    nombre: 'Back Squat',
    series: 5,
    reps: 5,
    carga: { tipo: 'kg', min: 100, max: 100 },
    esfuerzo: rir(2),
    tempo: { excentrica: 3, pausaAbajo: 1, concentrica: 1, pausaArriba: 0 },
    mide: 'atleta',
  };
  return planDe(ejercicio(bs, 120, 0).slice(0, -1));
}

/** La mayor sesión real de fuerza (488): 54 pasos, 7 ejercicios, aproximaciones, un ergo y un lastre. */
export const PASOS_488 = 54;

/** Cada escenario: la serie de la muñeca con su guion de botones. */
export function casoGarminFuerza(escenario: string): CasoGarminFuerza {
  switch (escenario) {
    case 'ronda':
      // 529: descanso de 2′ tras A2, quedan 25 s. START ×3 confirma A1 reps, A1 carga y A2 reps; BACK/LAP = Empezar ya.
      return deLaMuneca('ronda', pulsa([3000, 'start'], [4500, 'start'], [6000, 'start'], [9000, 'back']));
    case 'ultima':
      // A2 serie 4/4, la última del bloque: BACK/LAP cierra, suena «bloque hecho»; pasados los 5 s de deshacer se anota la ronda 4 y se empieza ya.
      return deLaMuneca('ultima', pulsa([2000, 'back'], [8000, 'start'], [9500, 'start'], [11000, 'start'], [13500, 'back']));
    case 'aproximacion':
      return deLaMuneca('aproximacion', pulsa([3000, 'back'], [9500, 'back']));
    case 'anotar':
      // reps 6 → 5 (DOWN, START) · carga 135 (START) · RPE 6,5 → 7 (UP, START).
      return deLaMuneca('anotar', pulsa([2500, 'down'], [4000, 'start'], [5500, 'start'], [7000, 'up'], [8500, 'start']));
    case 'cascada':
      // La carga 155 → 157,5 → 160 (UP ×2) y START; luego UP pasa a la página Estructura (la vuelta circular).
      return deLaMuneca('cascada', pulsa([2000, 'start'], [3500, 'up'], [4500, 'up'], [6000, 'start'], [7500, 'start'], [10000, 'up']));
    case 'isometria':
      return deLaMuneca('isometria');
    case 'deshacer':
      // BACK/LAP sin querer a los 1,5 s; UP a los 4,5 s, dentro de los 5 s.
      return deLaMuneca('deshacer', pulsa([1500, 'back'], [4500, 'up']));
    case 'ejercicios':
      // Abre en la página Estructura: DOWN mueve la lista de uno en uno y UP la devuelve.
      return deLaMuneca('ejercicios', pulsa([2500, 'down'], [4000, 'down'], [5500, 'up']), { pagina: 3 });
    case 'declaras-tu': {
      const plan = ejemploDeclarado();
      return {
        plan,
        sim: cuerpo,
        inicio: inicioEn(plan, indiceDe(plan, 'p11-bs-s3'), 18),
        registro: { 'p11-bs-s1': reps(5, 100, 2), 'p11-bs-s2': reps(5, 100, 2) },
        // BACK/LAP cierra la serie; pasados los 5 s, 4 reps (DOWN) y START: la carga y el RIR siguen sin confirmar.
        guion: pulsa([6000, 'back'], [12000, 'down'], [13500, 'start']),
      };
    }
    case 'entera-488': {
      const plan = sesion488();
      return { plan, sim: cuerpo, inicio: inicioEn(plan, 0, 0), registro: {} };
    }
    case 'superserie':
    default:
      // 529, A1 serie 1/4: BACK/LAP y A2 entra sin descanso.
      return deLaMuneca('superserie', pulsa([4200, 'back']));
  }
}
