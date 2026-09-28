// LOS CASOS — cada escenario de «iPhone · el ergo» como (plan, cuerpo, punto
// de partida, dispositivos, guion). El iPhone pinta EL MISMO estado que la
// muñeca (I1): el test de remo es el de la gramática; el cuerpo en la máquina
// es el de `sim.ts`, el mismo para todas las máquinas.

import type { CasoIphone } from '../iphone-vivo-gramatica/casos';
import { planTestRemo } from '../iphone-vivo-gramatica/casos';
import type { Dispositivos } from '../../kit-iphone-vivo';
import type { PlanSesion, Simulador, Vuelta } from '../../kit-reloj';
import { planBiciContinuo, planRemoSeries, planRemoZona, planSkiCalorias } from './planes';
import { enMaquina, hacia, ruido, sinMaquina, sinMonitorDesde } from './sim';

export type { CasoIphone };

/** El móvil lleva el motor; el pulso, de una banda. */
const MOVIL: Dispositivos = { reloj: 'sin', maquina: null, pulsometro: 'banda' };

const serieRemo = (n: number, segundos: number, metros: number, p: number): Vuelta => ({
  n,
  clase: 'serie',
  segundos,
  metros,
  ritmo: segundos / (metros / 1000),
  ppm: p,
  veredicto: null,
  eje: 'split500',
});

// ---------------------------------------------------------------------------
// Remo 5 × 500 m a 1:52–1:56 /500 · r 2′ parado
// ---------------------------------------------------------------------------

/**
 * La serie 3: entra a 1:54, se cae a 1:59 entre los segundos 38 y 52 (la
 * fatiga de la tercera) y vuelve al aviso. El pulso sube hacia 172 y baja a
 * 118 en la recuperación parada.
 */
const cuerpoRemo: Simulador = enMaquina({
  split: (p, i, t) => (i !== 4 ? 114 : t < 38 ? 114 : t < 44 ? 114 + (t - 38) : t < 52 ? 120 : t < 56 ? 120 - (t - 52) * 1.25 : 115),
  pulso: (p, _i, t) => (p.rol === 'trabajo' ? hacia(172, 150, t, 25) : hacia(118, 170, t, 35)),
  cadencia: 28,
});

/** Serie 3/5 a los 30 s: 126 m hechos, dos series ya cerradas. */
const INICIO_REMO = { i: 4, t: 30, metros: 132, sesionT: 486, sesionErgoM: 1132, ppmMedio: 152, vueltas: [serieRemo(1, 113, 500, 160), serieRemo(2, 115, 500, 166)] };

function remoSeries(): CasoIphone {
  return { plan: planRemoSeries(), sim: cuerpoRemo, inicio: INICIO_REMO, dispositivos: { ...MOVIL, maquina: 'remo' } };
}

// ---------------------------------------------------------------------------
// Los escenarios
// ---------------------------------------------------------------------------

export function casoDe(escenario: string): CasoIphone {
  switch (escenario) {
    case 'remo-recupera': {
      // La recuperación parada tras la serie 3: arranca a 95 s de 120, así que
      // en 10 s suena el preaviso, luego 3-2-1 y GO a la serie 4.
      const c = remoSeries();
      return {
        ...c,
        inicio: { i: 5, t: 95, sesionT: 666, sesionErgoM: 1500, ppmMedio: 154, vueltas: [...INICIO_REMO.vueltas, serieRemo(3, 116, 500, 171)] },
      };
    }
    case 'ski-calorias': {
      // Serie 2/5 a los 44 s (14 cal hechas): las calorías las cuenta el ski (lo hecho) y la serie se cierra sola a las 25.
      const sim = enMaquina({
        split: () => 118,
        pulso: (p, _i, t) => (p.rol === 'trabajo' ? hacia(168, 146, t, 20) : hacia(124, 166, t, 30)),
        cadencia: 40,
      });
      return { plan: planSkiCalorias(), sim, inicio: { i: 2, t: 44, sesionT: 178, sesionErgoM: 300, ppmMedio: 150 }, dispositivos: { ...MOVIL, maquina: 'ski' } };
    }
    case 'bici-continuo': {
      // 20′ a 2:05–2:10 /1000: va a 2:07 y a los 6 s se le va a 2:16 («▼ lento», aprieta), vuelve a los 20.
      const sim = enMaquina({
        split: (_p, _i, t) => {
          const s = t - 440;
          const s1000 = s < 6 ? 127 : s < 10 ? 127 + (s - 6) * 2.25 : s < 20 ? 136 : s < 26 ? 136 - (s - 20) * 1.5 : 127;
          return s1000 / 2;
        },
        pulso: (_p, _i, t) => hacia(156, 150, t, 40),
        cadencia: 86,
      });
      return { plan: planBiciContinuo(), sim, inicio: { i: 0, t: 440, metros: 3470, sesionT: 440, sesionErgoM: 3470, ppmMedio: 149 }, dispositivos: { ...MOVIL, maquina: 'bici' } };
    }
    case 'remo-zona': {
      // 30′ a Z2 (139–150): el pulso manda y tiñe; a los 8 s pasa a 153 (Z3, «▲ alto», afloja) y vuelve a 147.
      const sim = enMaquina({
        split: () => 128,
        pulso: (_p, _i, t) => {
          const s = t - 612;
          return s < 8 ? 146 : s < 12 ? 146 + (s - 8) * 1.75 : s < 24 ? 153 : s < 32 ? 153 - (s - 24) * 0.75 : 147;
        },
        cadencia: 22,
      });
      return { plan: planRemoZona(), sim, inicio: { i: 0, t: 612, metros: 2390, sesionT: 612, sesionErgoM: 2390, ppmMedio: 143 }, dispositivos: { ...MOVIL, maquina: 'remo' } };
    }
    case 'test': {
      // El test de remo de 2 km de la gramática: el mismo plan; el pulso sube hasta 186.
      const sim = enMaquina({ split: () => 112, pulso: (_p, _i, t) => Math.min(186, 150 + t * 0.25), cadencia: 30 });
      return { plan: planTestRemo(), sim, inicio: { i: 0, t: 291, metros: 1300, sesionT: 291, sesionErgoM: 1300, ppmMedio: 172 }, dispositivos: { ...MOVIL, maquina: 'remo' } };
    }
    case 'maquina-perdida': {
      // A los 3 s de escenario el remo deja de llegar: lo suyo se marca viejo.
      const c = remoSeries();
      return { ...c, sim: sinMonitorDesde(c.sim, INICIO_REMO.t + 3) };
    }
    case 'sin-maquina': {
      // La misma serie sin el remo emparejado: los 500 m los dices tú; queda el crono y el pulso.
      return {
        plan: planRemoSeries(false),
        sim: sinMaquina({ pulso: (p, _i, t) => (p.rol === 'trabajo' ? hacia(172, 150, t, 25) : hacia(118, 170, t, 35)) }),
        inicio: { i: 4, t: 41, sesionT: 497, ppmMedio: 152, vueltas: [serieRemo(1, 113, 500, 160), serieRemo(2, 115, 500, 166)].map((v) => ({ ...v, metros: null, ritmo: null })) },
        dispositivos: MOVIL,
      };
    }
    case 'libre': {
      // El mismo remo 5 × 500 m, construido por el atleta: el mismo objeto, la
      // misma pantalla. Serie 2/5 a los 58 s, a 1:53, para que no sea la misma
      // captura.
      const sim = enMaquina({
        split: (_p, _i, t) => 113 + ruido(t * 0.2, 0.6),
        pulso: (p, _i, t) => (p.rol === 'trabajo' ? hacia(168, 148, t, 25) : hacia(118, 166, t, 35)),
        cadencia: 27,
      });
      return { plan: planRemoSeries(), sim, inicio: { i: 2, t: 58, metros: 257, sesionT: 291, sesionErgoM: 757, ppmMedio: 150, vueltas: [serieRemo(1, 113, 500, 160)] }, dispositivos: { ...MOVIL, maquina: 'remo' } };
    }
    case 'remo-series':
    case 'horizontal':
    default:
      return remoSeries();
  }
}

/** Para los tests: los planes de la familia con su nombre. */
export const PLANES: Record<string, () => PlanSesion> = {
  'remo-series': planRemoSeries,
  'ski-calorias': planSkiCalorias,
  'bici-continuo': planBiciContinuo,
  'remo-zona': planRemoZona,
  test: planTestRemo,
};
