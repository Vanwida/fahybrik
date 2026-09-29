// LOS CASOS DE «GARMIN · CORRER» — cada escenario como (plan, cuerpo, punto de
// partida). Los de la muñeca se IMPORTAN (`casoDe` de `reloj-correr/casos.ts`:
// mismo plan, mismo cuerpo, mismo instante, pintados por otro reloj); aquí solo
// se escriben los que la muñeca no tenía o los que cambian el cuerpo:
//
//   · serie-rapida   la misma serie yendo rápido Y luego lento: el «afloja» y el
//                    «aprieta» de §6 en un mismo escenario (la muñeca solo
//                    enseñaba el primero).
//   · gps-perdido    el GPS se cae a mitad de un tramo y vuelve (G26).
//   · pulso-perdido  el pulso óptico del reloj se cae en una serie a zona (G7).
//   · pista          un tempo en la pista de atletismo, vuelta de 400 m (sesionPista):
//                    la tarjeta «Vuelta 7» y la lista «v 7» son las del kit.
//   · tamanos-*      los casos que más aprietan el círculo, en los cuatro relojes.
//
// El cuerpo es determinista: el mismo escenario, la misma carrera, segundo a
// segundo, para que lo que se juzga se pueda repetir. Ningún número de aquí es
// método: los umbrales y la cadencia de los avisos vienen del plan.

import type { Diametro } from '../../kit-garmin';
import { vueltaAutomatica, type Simulador, type Vuelta } from '../../kit-reloj';
import { casoDe, cuerpo, type CasoCorrer } from '../reloj-correr/casos';
import { sesion538 } from '../reloj-correr/planes';
import { VUELTA_PISTA_M, sesionPista } from './planes';

export interface CasoGarminCorrer {
  caso: CasoCorrer;
  inicial?: { tamano?: Diametro; pagina?: number };
  /** Los cuatro relojes a la vez, con el motor quieto. */
  comparar?: boolean;
  /** Qué enseña la comparación si no es la cara del paso: la tarjeta de la vuelta que el motor cierra al primer segundo. */
  tarjeta?: 'vuelta';
}

// ---------------------------------------------------------------------------
// El cuerpo de cada caso propio
// ---------------------------------------------------------------------------

/** El ritmo del centro de la banda (3:45–3:55) y los dos excesos: 3:38 (rápido) y 4:06 (lento), en s/km. */
const RITMO_SERIE = 230;
const RAPIDO_S = 218;
const LENTO_S = 246;

/**
 * Se va rápido entre el segundo 44 y el 64 (vuelve a la banda hacia el 70) y
 * más tarde se queda lento entre el 84 y el 100 (vuelve hacia el 106). Con la
 * histéresis y la cadencia del coach, «afloja» sale UNA vez y «aprieta»
 * también: dos avisos distintos en la misma serie.
 */
function ritmoRapidoYLento(t: number): number {
  if (t < 44) return RITMO_SERIE;
  if (t < 50) return RITMO_SERIE - ((t - 44) * (RITMO_SERIE - RAPIDO_S)) / 6;
  if (t < 64) return RAPIDO_S;
  if (t < 70) return RAPIDO_S + ((t - 64) * (RITMO_SERIE + 1 - RAPIDO_S)) / 6;
  if (t < 84) return RITMO_SERIE + 1;
  if (t < 90) return RITMO_SERIE + 1 + ((t - 84) * (LENTO_S - RITMO_SERIE - 1)) / 6;
  if (t < 100) return LENTO_S;
  if (t < 106) return LENTO_S - ((t - 100) * (LENTO_S - RITMO_SERIE - 1)) / 6;
  return RITMO_SERIE + 1;
}

function serieRapidaYLenta(): CasoCorrer {
  const base = casoDe('serie-rapida');
  return { ...base, sim: cuerpo({ partida: { i: 5, t: 40 }, ppmDesde: 150, ritmo: (_p, i, t) => (i === 5 ? ritmoRapidoYLento(t) : undefined) }) };
}

/** Un instante DENTRO del tramo rápido de la serie, para el comparador (motor quieto). */
function serieFueraDeBanda(): CasoCorrer {
  const base = serieRapidaYLenta();
  return { ...base, inicio: { ...base.inicio, t: 56, metros: 236, sesionT: 1595, sesionM: 5437 } };
}

/** El GPS se cae a los 3 s y vuelve a los 31: el tramo 1 del progresivo (538), por tiempo, a 5:20. */
const GPS_CAE_S = 303;
const GPS_VUELVE_S = 331;

function gpsPerdido(): CasoCorrer {
  return {
    datos: sesion538(),
    sim: cuerpo({
      partida: { i: 0, t: 300 },
      ritmo: (_p, i) => (i === 0 ? 322 : undefined),
      gps: (sesionT) => (sesionT >= GPS_CAE_S && sesionT < GPS_VUELVE_S ? 'buscando' : 'listo'),
    }),
    inicio: { i: 0, t: 300, metros: 932, sesionT: 300, sesionM: 932, ppmMedio: 146 },
  };
}

/** El pulso se cae a los 4 s de la serie 2 de 6 a Z5 (479) y vuelve a los 24: el reloj sin correa. */
const PULSO_CAE_S = 718;
const PULSO_VUELVE_S = 738;

function pulsoPerdido(): CasoCorrer {
  const base = casoDe('serie-z5');
  const sim: Simulador = (p, i, t, sesionT) => {
    const l = base.sim(p, i, t, sesionT);
    return sesionT >= PULSO_CAE_S && sesionT < PULSO_VUELVE_S ? { ...l, ppm: null, ppmTendencia: undefined } : l;
  };
  return { ...base, sim };
}

/**
 * La pista: 4000 m a 4:10 /km, 10 vueltas de 400 m. Arranca a 3 m de cruzar la
 * vuelta 7, con las seis anteriores en la lista (una, la 5.ª, rápida): la
 * tarjeta sale al primer segundo y la siguiente, 100 s después.
 */
const VUELTAS_HECHAS: Array<[segundos: number, ppm: number]> = [
  [101, 158],
  [100, 164],
  [100, 167],
  [103, 169],
  [96, 170],
  [100, 171],
];

function pista(): CasoCorrer {
  const datos = sesionPista();
  const { pasos, reglas, zonas } = datos.plan;
  const tempo = { ...pasos[0]!, vueltaAutoM: VUELTA_PISTA_M };
  // Las vueltas ya hechas, como las deja el motor (con su ritmo por km y su veredicto).
  const vueltas: Vuelta[] = VUELTAS_HECHAS.map(([segundos, ppm], k) => vueltaAutomatica(tempo, k + 1, segundos, ppm, reglas, zonas));
  const hechoS = VUELTAS_HECHAS.reduce((a, [s]) => a + s, 0);
  return {
    datos,
    sim: cuerpo({ partida: { i: 0, t: 699 }, ritmo: () => 250 }),
    inicio: { i: 0, t: 699, metros: 2797, sesionT: 699, sesionM: 2797, vueltaDesdeT: hechoS, vueltas, ppmMedio: 165 },
  };
}

// ---------------------------------------------------------------------------
// El mapa escenario → caso
// ---------------------------------------------------------------------------

export function casoGarminCorrer(escenario: string): CasoGarminCorrer {
  switch (escenario) {
    case 'serie-rapida':
      return { caso: serieRapidaYLenta() };
    case 'gps-buscando':
      return { caso: casoDe('gps') };
    case 'gps-perdido':
      return { caso: gpsPerdido() };
    case 'pulso-perdido':
      return { caso: pulsoPerdido() };
    case 'pista':
      return { caso: pista() };
    case 'tamanos-fuera':
      return { caso: serieFueraDeBanda(), comparar: true };
    case 'tamanos-tanda':
      return { caso: casoDe('tanda-serie'), comparar: true };
    case 'tamanos-rpe':
      return { caso: casoDe('strides'), comparar: true };
    case 'tamanos-pista':
      return { caso: pista(), comparar: true, tarjeta: 'vuelta' };
    case 'serie-dentro':
    case 'serie-z5':
    case 'recupera-go':
    case 'rodaje-z2':
    case 'tirada-z2':
    case 'tempo-z4':
    case 'strides':
    case 'progresivo':
    case 'tanda-serie':
    case 'tanda-descanso':
    case 'cinta':
      return { caso: casoDe(escenario) };
    default:
      return { caso: casoDe('serie-dentro') };
  }
}
