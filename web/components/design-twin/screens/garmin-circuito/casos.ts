// LOS CASOS DEL CIRCUITO EN GARMIN — cada escenario como (circuito, cuerpo,
// punto de partida, botones). Los planes, el cuerpo del atleta simulado y su
// historial son los de «Muñeca · circuito y HYROX» (`reloj-circuito/casos.ts`):
// el mismo dato, otro pintor. Lo único propio es lo que Garmin no lee (el
// ergómetro, el movimiento) y los botones guionizados, que pasan por la MISMA
// tabla de §5 que la tecla.

import type { BotonGarmin, Diametro } from '../../kit-garmin';
import type { Dial } from '../../kit-reloj/tarea';
import type { InicioSecuencia, Simulador } from '../../kit-reloj/secuencia';
import { caso } from '../reloj-circuito/casos';
import { sesion492, sesion493, sesion506, type Circuito } from '../reloj-circuito/planes';
import { paraGarmin, simulacro, simulacroDobles } from './plan';

export interface CasoGarmin {
  c: Circuito;
  sim: Simulador;
  inicio: InicioSecuencia;
  /** La puntuación ya dicha en cada campana de AMRAP, por índice de paso. */
  diales?: Record<number, Dial>;
  inicial?: { tamano?: Diametro; pagina?: number; controles?: boolean };
  guion?: Array<{ en: number; boton: BotonGarmin }>;
  /** Los cuatro tamaños a la vez, con el motor quieto. */
  comparar?: boolean;
}

type Extra = Partial<Omit<CasoGarmin, 'c' | 'sim' | 'inicio'>> & { metros?: number };

/** Un escenario en el paso `i`, a `t` s de él, con el historial simulado de lo anterior. */
function enPaso(c: Circuito, i: number, t: number, ritmoRun: number, extra: Extra = {}): CasoGarmin {
  const { metros, ...resto } = extra;
  const base = caso(c, i, t, ritmoRun, { metros });
  return { c: base.c, sim: base.sim, inicio: base.inicio, ...resto };
}

/** 493: el paso k de la ronda r (0 = Run, 1 = estación, 2 = descanso). */
const en493 = (r: number, k: 0 | 1 | 2) => 1 + (r - 1) * 3 + k;
/** HYROX con Roxzone: el paso k de la estación n (0 = Run, 1 = Roxzone de entrada, 2 = estación, 3 = Roxzone de salida). */
const enHyrox = (n: number, k: 0 | 1 | 2 | 3) => (n - 1) * 4 + k;

/** El ritmo del atleta SIMULADO en sus carreras, s/km (el historial de cada escenario es suyo, no de una ejecución real). */
const RITMO_493 = 268;
const RITMO_HYROX = 280;

/** Tu pareja espera: el pulso baja como en cualquier descanso (nadie mide lo que ella hace). */
const PULSO_ESPERA = { desde: 172, hasta: 118, tau: 35 } as const;

function conEsperaDeLaPareja(base: Simulador): Simulador {
  return (p, i, t, sesionT) =>
    p.dobles?.turno === 'pareja'
      ? { ritmo: null, ppm: Math.round(PULSO_ESPERA.hasta + (PULSO_ESPERA.desde - PULSO_ESPERA.hasta) * Math.exp(-t / PULSO_ESPERA.tau)), ppmTendencia: 'baja', gps: 'no-aplica' }
      : base(p, i, t, sesionT);
}

/** Los escenarios que se prueban uno a uno: cada circuito y a qué paso llega cada uno. */
export function casoDe(escenario: string): CasoGarmin {
  switch (escenario) {
    case 'c493-ski':
      // SkiErg 500 m sin lectura del ergómetro: lo dices tú. BACK/LAP a los 4 s cierra la estación (y entra el descanso).
      return enPaso(paraGarmin(sesion493()), en493(1, 1), 93, RITMO_493, { guion: [{ en: 4000, boton: 'back' }] });
    case 'c493-bbj':
      return enPaso(paraGarmin(sesion493()), en493(2, 1), 72, RITMO_493, { guion: [{ en: 3500, boton: 'back' }] });
    case 'c493-descanso':
      return enPaso(paraGarmin(sesion493()), en493(2, 2), 76, RITMO_493);
    case 'c492-ronda5':
      // El descanso tras los Farmers de la ronda 4, con 12 s: viene la ronda 5, que ya no lleva Farmers.
      return enPaso(paraGarmin(sesion492()), 23, 78, RITMO_493);
    case 'c506-amrap':
      // Ronda 2, a 11 s de la campana; la ronda 1 dijo 31 reps. En la campana: UP ×16 y START.
      return enPaso(paraGarmin(sesion506()), 4, 229, RITMO_493, {
        diales: { 2: { rondas: 0, reps: 31 } },
        guion: [...Array.from({ length: 16 }, (_, k) => ({ en: 12500 + k * 130, boton: 'up' as const })), { en: 16000, boton: 'start' }],
      });
    case 'hyrox-carrera':
      return enPaso(simulacro(), enHyrox(5, 0), 112, RITMO_HYROX, { metros: 400 });
    case 'hyrox-roxzone':
      // Faltan 60 m del último Run; al cerrarse solo entra la Roxzone, y a los 26 s la cierra el atleta (empieza la estación).
      return enPaso(simulacro(), enHyrox(8, 0), 263, RITMO_HYROX, { metros: 940, guion: [{ en: 26000, boton: 'back' }] });
    case 'hyrox-sled':
      // Sled Push lo dices tú → Roxzone de salida (también la cierras tú al echar a correr) → Run 3.
      return enPaso(simulacro(), enHyrox(2, 2), 151, RITMO_HYROX, {
        guion: [
          { en: 3500, boton: 'back' },
          { en: 14000, boton: 'back' },
        ],
      });
    case 'hyrox-sin-pm5':
      return enPaso(simulacro(), enHyrox(1, 2), 150, RITMO_HYROX);
    case 'hyrox-ruta':
      return enPaso(simulacro(), enHyrox(5, 0), 112, RITMO_HYROX, { metros: 400, inicial: { pagina: 2 } });
    case 'hyrox-simulacro':
      return enPaso(simulacro(), enHyrox(1, 0), 38, RITMO_HYROX, { metros: 140 });
    case 'hyrox-final':
      // Wall Balls, la última estación: al cerrarla, el simulacro termina y el total es la puntuación.
      return enPaso(simulacro(), enHyrox(8, 2), 280, RITMO_HYROX, { guion: [{ en: 7000, boton: 'back' }] });
    case 'hyrox-dobles': {
      const c = simulacroDobles();
      const b = enPaso(c, enHyrox(3, 2), 41, RITMO_HYROX, { guion: [{ en: 9000, boton: 'back' }] });
      return { ...b, sim: conEsperaDeLaPareja(b.sim) };
    }
    case 'hyrox-dobles-reparto': {
      const c = simulacroDobles();
      const b = enPaso(c, enHyrox(8, 2), 30, RITMO_HYROX);
      return { ...b, sim: conEsperaDeLaPareja(b.sim) };
    }
    case 'tamanos-carrera':
      return { ...enPaso(paraGarmin(sesion493()), en493(2, 0), 222, RITMO_493, { metros: 830 }), comparar: true };
    case 'tamanos-estacion':
      return { ...enPaso(paraGarmin(sesion493()), en493(2, 1), 72, RITMO_493), comparar: true };
    case 'c493-carrera':
    default:
      // A 170 m del final: el preaviso a los 100 m y, al cerrarse solo, «entras a Burpee Broad Jump».
      return enPaso(paraGarmin(sesion493()), en493(2, 0), 222, RITMO_493, { metros: 830 });
  }
}
