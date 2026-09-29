// LOS CASOS DE «GARMIN · WOD Y ERGO» — cada escenario como (plan, cuerpo, punto
// de partida). Los de la muñeca se IMPORTAN (`casoDe` de `reloj-wod/casos.ts`:
// mismo plan, mismo cuerpo, mismo instante, pintados por otro reloj) y se
// adaptan a lo que un Garmin v1 mide de verdad (`sinmonitor.ts`): el remo, el ski
// y la bici NO dan metros ni /500. Aquí solo se escribe lo que la muñeca no tenía
// o lo que cambia:
//
//   · amrap-reps       el AMRAP con reps contadas con UP en la ronda en curso
//   · ergo-505-cierre  la serie de 250 m que se cierra con BACK/LAP y su resultado
//   · fortime-final    el último movimiento y el crono congelado
//   · tamanos-*        los casos que más aprietan el círculo, en los cuatro relojes
//
// El cuerpo es determinista: el mismo escenario, el mismo WOD, segundo a segundo.
// Ningún número de aquí es método del coach: los umbrales y la cadencia de los
// avisos vienen del plan (`REGLAS_AVISO_DEFECTO`).

import type { BotonGarmin, Diametro } from '../../kit-garmin';
import { esCarrera, wodDe, type InicioSecuencia, type PasoBase, type Simulador, type Vuelta } from '../../kit-reloj';
import { casoDe as casoDeLaMuneca } from '../reloj-wod/casos';
import type { PlanWod } from '../reloj-wod/planes';
import type { Marcador, WodInicial } from './estado';
import { sinLecturaDeMaquina, sinMetrosDeMaquina, sinMonitor } from './sinmonitor';

export interface CasoGarminWod {
  /** El plan ya sin lo que solo lee el monitor de la máquina. */
  datos: PlanWod;
  sim: Simulador;
  inicio: InicioSecuencia;
  wod?: WodInicial;
  /** Botones guionizados: pasan por el MISMO camino que la tecla. */
  guion?: Array<{ en: number; boton: BotonGarmin }>;
  inicial?: { tamano?: Diametro };
  /** Los cuatro relojes a la vez, con el motor quieto. */
  comparar?: boolean;
}

/** ¿Se corre este paso (GPS o cinta)? Sus metros SÍ los mide el reloj. */
const seCorre = (p: PasoBase) => esCarrera(p) || (wodDe(p)?.formato === 'emom' && (p.wod as { tarea: { corre?: boolean } }).tarea.corre === true);

/** Lo de la muñeca sin lo del monitor: el plan, el cuerpo y el punto de partida (los metros de un paso que no se corre, fuera). */
function deLaMuneca(id: string, corridas?: (v: Vuelta) => boolean): CasoGarminWod {
  const c = casoDeLaMuneca(id);
  const datos: PlanWod = { ...c.datos, plan: sinMonitor(c.datos.plan) };
  const inicio: InicioSecuencia = {
    ...c.inicio,
    sesionErgoM: undefined,
    metros: seCorre(datos.plan.pasos[c.inicio.i]!) ? c.inicio.metros : undefined,
    vueltas: sinMetrosDeMaquina(c.inicio.vueltas, corridas ?? ((v) => v.clase === 'auto')),
  };
  const marcadores: Record<number, Marcador> = {};
  for (const [k, cierres] of Object.entries(c.wod?.rondas ?? {})) marcadores[Number(k)] = { cierres, reps: null };
  return { datos, sim: sinLecturaDeMaquina(c.sim), inicio, wod: c.wod ? { hechas: c.wod.hechas, marcadores } : undefined };
}

// ---------------------------------------------------------------------------
// Los casos propios
// ---------------------------------------------------------------------------

/** Cinco rondas cerradas de las cuatro del AMRAP 15′ y catorce reps de la sexta: 12 Wall Ball + 2 KB Swing. */
const CINCO_RONDAS = [104, 213, 326, 444, 566];

function amrapReps(): CasoGarminWod {
  const c = deLaMuneca('amrap-15');
  return { ...c, inicio: { ...c.inicio, t: 610, sesionT: 610 }, wod: { marcadores: { 0: { cierres: CINCO_RONDAS, reps: 14 } } } };
}

/** El AMRAP en la campana, con las 7 rondas cerradas y sin decir las reps (siempre «—», nunca 0). */
const SIETE_RONDAS = [104, 213, 326, 444, 566, 690, 817];

/** La misma serie de SkiErg a punto de cerrarse (3 s antes del minuto): BACK/LAP la cierra y el /500 se deduce del crono. */
function ergo505Cierre(): CasoGarminWod {
  const c = deLaMuneca('ergo-sin-pm5');
  return { ...c, inicio: { ...c.inicio, t: 57, sesionT: 268 }, guion: [{ en: 3000, boton: 'back' }] };
}

/** Sobre el último movimiento del For Time: al cerrarlo el crono se congela y es tu tiempo. */
function forTimeFinal(): CasoGarminWod {
  const c = deLaMuneca('fortime');
  return { ...c, inicio: { i: 8, t: 6, sesionT: 1096, ppmMedio: 165 } };
}

/** El AMRAP justo tras la campana: la puntuación con 7 rondas y 18 reps dichas. */
function campanaSonada(): CasoGarminWod {
  const c = deLaMuneca('amrap-campana');
  return { ...c, inicio: { i: 1, t: 3, sesionT: 903, ppmMedio: 162 }, wod: { marcadores: { 0: { cierres: SIETE_RONDAS, reps: 18 } } } };
}

// ---------------------------------------------------------------------------
// El mapa escenario → caso
// ---------------------------------------------------------------------------

export function casoGarminWod(escenario: string): CasoGarminWod {
  switch (escenario) {
    case 'emom-alterno':
      // A los 3,5 s, BACK/LAP marca la tarea del minuto: la ventana NO se cierra, lo que queda es respiro.
      return { ...deLaMuneca('emom-alterno'), guion: [{ en: 3500, boton: 'back' }] };
    case 'emom-75':
      // La ventana de correr conserva sus metros (cinta); las de remo y ski no los tienen.
      return deLaMuneca('emom-75', (v) => v.n % 3 === 0);
    case 'amrap-reps':
      return amrapReps();
    case 'amrap-campana': {
      const c = deLaMuneca('amrap-campana');
      return { ...c, wod: { marcadores: { 0: { cierres: SIETE_RONDAS, reps: null } } } };
    }
    case 'ergo-505':
      return deLaMuneca('ergo-sin-pm5');
    case 'ergo-505-cierre':
      return ergo505Cierre();
    case 'fortime-final':
      return forTimeFinal();
    case 'tamanos-emom':
      return { ...deLaMuneca('emom-alterno'), comparar: true };
    case 'tamanos-amrap':
      return { ...amrapReps(), comparar: true };
    case 'tamanos-campana':
      return { ...campanaSonada(), comparar: true };
    case 'tamanos-fortime':
      return { ...deLaMuneca('fortime'), comparar: true };
    case 'tamanos-ergo':
      return { ...deLaMuneca('ergo-sin-pm5'), comparar: true };
    case 'amrap-15':
    case 'amrap-506':
    case 'fortime':
    case 'carrera-5k':
    case 'ergo-530':
    case 'ergo-escalera':
    case 'ergo-514':
    case 'tabata':
      return deLaMuneca(escenario);
    default:
      return deLaMuneca('emom-alterno');
  }
}
