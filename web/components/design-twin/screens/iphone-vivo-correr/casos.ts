// LOS CASOS — cada escenario de «iPhone · correr» como (plan, cuerpo, punto
// de partida, dispositivos, guion). Los planes y los cuerpos son LOS DE LA
// MUÑECA (`screens/reloj-correr/casos.ts`): el iPhone pinta el mismo estado
// (I1). Lo que el móvil añade y la muñeca no tenía se envuelve, no se
// reescribe: la cadencia que mide el propio teléfono (su podómetro) en calle,
// y la cinta sin conectar (nadie mide el ritmo ni los metros).

import type { Dispositivos, GestoIphone } from '../../kit-iphone-vivo';
import type { InicioSecuencia, PlanSesion, Simulador } from '../../kit-reloj';
import { casoDe as casoCorrer, cuerpo } from '../reloj-correr/casos';
import { TEMPO_CINTA_I, libreSeisPorMil, tempoCinta } from './planes';

export interface CasoCorrerIphone {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  dispositivos: Dispositivos;
  guion?: Array<{ en: number; gesto: GestoIphone }>;
}

/** El móvil lleva el motor; el pulso, de una banda. */
const MOVIL: Dispositivos = { reloj: 'sin', maquina: null, pulsometro: 'banda' };
/** La cinta emparejada: manda su ritmo y sus metros. */
const CON_CINTA: Dispositivos = { ...MOVIL, maquina: 'cinta' };

const ruido = (t: number, a: number) => Math.sin(t * 1.3) * a * 0.6 + Math.sin(t * 0.37 + 1) * a * 0.4;

/** Cadencia de un corredor a ese ritmo (s/km): ~180 pasos/min corriendo fuerte, ~168 trotando. */
const cadenciaA = (ritmo: number) => (ritmo < 260 ? 181 : ritmo < 330 ? 174 : 166);

/**
 * El podómetro del teléfono mide la cadencia siempre que se corre (calle y
 * cinta). El cuerpo de la muñeca no la daba porque el reloj no la pinta.
 */
export function conCadencia(sim: Simulador): Simulador {
  return (p, i, t, s) => {
    const l = sim(p, i, t, s);
    return l.ritmo == null ? l : { ...l, cadencia: Math.round(cadenciaA(l.ritmo) + ruido(t, 1.2)) };
  };
}

/** Sin la cinta conectada nadie mide el ritmo ni los metros: el pulso sigue llegando de la banda. */
export function sinCinta(sim: Simulador): Simulador {
  return (p, i, t, s) => ({ ...sim(p, i, t, s), ritmo: null, cadencia: null });
}

/** El tempo en cinta, a 3:20 del tempo, con 16:40 por delante. */
const inicioCinta = (conMetros: boolean): InicioSecuencia => ({
  i: TEMPO_CINTA_I,
  t: 200,
  sesionT: 800,
  ...(conMetros ? { metros: 769, sesionM: 2340 } : {}),
  ppmMedio: 148,
});

export function casoDe(escenario: string): CasoCorrerIphone {
  switch (escenario) {
    case 'rodaje-z2': {
      const c = casoCorrer('rodaje-z2');
      // El rodaje es UN paso: los metros del paso son los de la sesión (la muñeca no los pintaba por paso).
      return { plan: c.datos.plan, sim: conCadencia(c.sim), inicio: { ...c.inicio, metros: c.inicio.sesionM }, dispositivos: MOVIL };
    }
    case 'serie-rapida': {
      const c = casoCorrer('serie-rapida');
      return { plan: c.datos.plan, sim: conCadencia(c.sim), inicio: c.inicio, dispositivos: MOVIL };
    }
    case 'recuperacion': {
      const c = casoCorrer('recupera-go');
      return { plan: c.datos.plan, sim: conCadencia(c.sim), inicio: c.inicio, dispositivos: MOVIL };
    }
    case 'cinta-conectada':
      return {
        plan: tempoCinta(),
        sim: conCadencia(cuerpo({ partida: { i: TEMPO_CINTA_I, t: 200 }, ritmo: (p) => (p.clase === 'tempo' ? 259 : undefined) })),
        inicio: inicioCinta(true),
        dispositivos: CON_CINTA,
      };
    case 'cinta-lo-dices-tu':
      return {
        plan: tempoCinta(),
        sim: sinCinta(cuerpo({ partida: { i: TEMPO_CINTA_I, t: 200 } })),
        inicio: inicioCinta(false),
        dispositivos: MOVIL,
      };
    case 'progresivo': {
      const c = casoCorrer('progresivo');
      // La muñeca arranca a 24 s del tramo 3; aquí a 50 s, para ver el paso al tramo 4 en 10 s.
      return { plan: c.datos.plan, sim: conCadencia(cuerpo({ partida: { i: 2, t: 50 } })), inicio: { ...c.inicio, t: 50, sesionT: 710, sesionM: 2270 }, dispositivos: MOVIL };
    }
    case 'rpe': {
      const c = casoCorrer('strides');
      return { plan: c.datos.plan, sim: conCadencia(c.sim), inicio: c.inicio, dispositivos: MOVIL };
    }
    case 'mapa': {
      const c = casoCorrer('tirada-z2');
      return { plan: c.datos.plan, sim: conCadencia(c.sim), inicio: { ...c.inicio, metros: c.inicio.sesionM }, dispositivos: MOVIL, guion: [{ en: 1200, gesto: 'mapa' }] };
    }
    case 'libre': {
      const c = casoCorrer('serie-dentro');
      return { plan: libreSeisPorMil(), sim: conCadencia(c.sim), inicio: c.inicio, dispositivos: MOVIL };
    }
    case 'serie-dentro':
    default: {
      const c = casoCorrer('serie-dentro');
      return { plan: c.datos.plan, sim: conCadencia(c.sim), inicio: c.inicio, dispositivos: MOVIL };
    }
  }
}
