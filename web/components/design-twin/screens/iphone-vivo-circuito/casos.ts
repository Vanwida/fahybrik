// LOS CASOS — cada escenario como (circuito o plan, cuerpo, punto de partida,
// dispositivos, guion). Reutiliza las sesiones reales y el cuerpo simulado de
// la muñeca (`screens/reloj-circuito`): el iPhone pinta EL MISMO estado (I1).
// Lo que la muñeca no tenía (el bloque continuo, el circuito libre, el run de
// HYROX con el ritmo del coach, el monitor que reporta paladas, vatios y
// calorías) se añade aquí y se dice que es ilustrativo.

import type { Dispositivos, GestoIphone, IdPagina } from '../../kit-iphone-vivo';
import type { InicioSecuencia, Objetivo, PlanSesion, Simulador } from '../../kit-reloj';
import { conMaquina } from '../iphone-vivo-gramatica/casos';
import { caso as casoCircuito } from '../reloj-circuito/casos';
import { sesion492, sesion493, simulacionHyrox, type Circuito } from '../reloj-circuito/planes';
import { TRAMO_CONTINUO_S, bloqueContinuo, circuitoLibre } from './planes';

export interface CasoCircuitoIphone {
  /** Un circuito (rondas, HYROX, libre) con su crono total y su ruta… */
  c?: Circuito;
  /** …o un plan sin más (el bloque continuo: no es un circuito, no tiene puntuación). */
  plan?: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  dispositivos: Dispositivos;
  /** Con todas las máquinas emparejadas, el chip sigue al paso (el remo, luego el ski…). */
  maquinaDelPaso?: boolean;
  paginaInicial?: IdPagina;
  guion?: Array<{ en: number; gesto: GestoIphone }>;
}

/** El móvil lleva el motor; el pulso, de una banda. */
const MOVIL: Dispositivos = { reloj: 'sin', maquina: null, pulsometro: 'banda' };

const ruido = (t: number, a: number) => Math.sin(t * 1.3) * a * 0.6 + Math.sin(t * 0.37 + 1) * a * 0.4;

/** 493: el paso k de la ronda r (0 = Run, 1 = estación, 2 = descanso). */
const en493 = (r: number, k: 0 | 1 | 2) => 1 + (r - 1) * 3 + k;
/** HYROX con Roxzone: el paso k de la estación n (0 = Run, 1 = Roxzone de entrada, 2 = estación, 3 = Roxzone de salida). */
const enHyrox = (n: number, k: 0 | 1 | 2 | 3) => (n - 1) * 4 + k;
/** El circuito libre: el paso k de la ronda r (0 = Run, 1 = Wall Balls, 2 = Row). */
const enLibre = (r: number, k: 0 | 1 | 2) => (r - 1) * 3 + k;

const RITMO_493 = 268;
const RITMO_HYROX = 280;
/** Cap del For Time: la 441 no lo trae; 90′ es de ejemplo, para ver dónde va. */
const CAP_EJEMPLO = 90 * 60;
/** El ritmo que el coach fija a los runs (ilustrativo: la 441 no lo trae). */
const RITMO_RUN_COACH: Objetivo = { eje: 'ritmo', min: 275, max: 285, papel: 'principal' };

const hyrox = (o: Partial<Parameters<typeof simulacionHyrox>[0]> = {}) => simulacionHyrox({ pm5: true, roxzone: true, cap: CAP_EJEMPLO, ...o });

/** El cuerpo del bloque continuo: cada máquina da su /500 y su cadencia; el pulso, en Z2 con retraso al cambiar. */
function cuerpoContinuo(): Simulador {
  const split: Record<string, number> = { remo: 128, ski: 135, bici: 62 };
  const cadencia: Record<string, number> = { remo: 26, ski: 38, bici: 86 };
  const base: Simulador = (p, _i, t) => {
    const tipo = p.maquina?.tipo ?? 'remo';
    return { ritmo: null, split500: Math.round(2 * ((split[tipo] ?? 120) + ruido(t, 1.5))) / 2, ppm: Math.round(146 + ruido(t + 3, 1.5) - 6 * Math.exp(-t / 25)), gps: 'no-aplica' };
  };
  return (p, i, t, s) => {
    const tipo = p.maquina?.tipo ?? 'remo';
    return conMaquina(base, cadencia[tipo] ?? 30, tipo === 'cinta' ? 'remo' : tipo)(p, i, t, s);
  };
}

export function casoDe(escenario: string): CasoCircuitoIphone {
  switch (escenario) {
    case 'rondas-medida': {
      // 493, ronda 1: SkiErg 500 m con el ski, a 120 m del final; se cierra sola y entra el descanso.
      const c = casoCircuito(sesion493(), en493(1, 1), 93, RITMO_493, { metros: 380 });
      return { c: c.c, sim: conMaquina(c.sim, 42, 'ski'), inicio: c.inicio, dispositivos: MOVIL, maquinaDelPaso: true };
    }
    case 'rondas-sin-medir': {
      // 493, ronda 2: Burpee Broad Jump, lo dices tú; a los 3,5 s «Estación hecha» y el descanso.
      const c = casoCircuito(sesion493(), en493(2, 1), 72, RITMO_493);
      return { c: c.c, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, maquinaDelPaso: true, guion: [{ en: 3500, gesto: 'primaria' }] };
    }
    case 'rondas-carrera': {
      // 493, ronda 2: Run 1000 m a RPE 8 («ritmo de carrera»), a 80 m del final; se cierra sola y entra la estación.
      const c = casoCircuito(sesion493(), en493(2, 0), 246, RITMO_493, { metros: 920 });
      return { c: c.c, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, maquinaDelPaso: true };
    }
    case 'rondas-estructura': {
      // 492, el descanso tras los Farmers de la ronda 4: la Estructura con los parciales y la ronda 5 sin Farmers (M4).
      const c = casoCircuito(sesion492(), 23, 78, RITMO_493);
      return { c: c.c, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, paginaInicial: 'estructura' };
    }
    case 'hyrox-run-ritmo': {
      // El run 5/8 con el ritmo que fija el coach (4:35–4:45, ilustrativo): el atleta va a 4:30, «▲ rápido».
      const c = casoCircuito(hyrox({ run: [RITMO_RUN_COACH] }), enHyrox(5, 0), 108, 270, { metros: 400 });
      return { c: c.c, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, maquinaDelPaso: true };
    }
    case 'hyrox-ski': {
      // Estación 1/8, SkiErg 1000 m con el ski: quedan 385 m y el monitor manda su métrica.
      const c = casoCircuito(hyrox(), enHyrox(1, 2), 150, RITMO_HYROX, { metros: 615 });
      return { c: c.c, sim: conMaquina(c.sim, 42, 'ski'), inicio: c.inicio, dispositivos: MOVIL, maquinaDelPaso: true };
    }
    case 'hyrox-sin-maquina': {
      // La misma estación sin el ski emparejado: nadie cuenta los metros.
      const c = casoCircuito(hyrox({ pm5: false }), enHyrox(1, 2), 150, RITMO_HYROX);
      return { c: c.c, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL };
    }
    case 'hyrox-sled': {
      // Sled Push, lo dices tú; a los 3,5 s «Estación hecha» → Roxzone de salida (anda 6 s, corre) → Run 3 se abre solo.
      const c = casoCircuito(hyrox(), enHyrox(2, 2), 151, RITMO_HYROX);
      return { c: c.c, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, maquinaDelPaso: true, guion: [{ en: 3500, gesto: 'primaria' }] };
    }
    case 'hyrox-entrada': {
      // Faltan 60 m del Run 8: se cierra solo, Roxzone de entrada («entras a Wall Balls»); a los 24 s, «Empiezo».
      const c = casoCircuito(hyrox(), enHyrox(8, 0), 263, RITMO_HYROX, { metros: 940 });
      return { c: c.c, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, maquinaDelPaso: true, guion: [{ en: 24000, gesto: 'primaria' }] };
    }
    case 'hyrox-estructura': {
      const c = casoCircuito(hyrox(), enHyrox(5, 0), 112, RITMO_HYROX, { metros: 400 });
      return { c: c.c, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, maquinaDelPaso: true, paginaInicial: 'estructura' };
    }
    case 'continuo': {
      // A 12 s del final del remo: pasa al ski sin puerta ni cuenta atrás; solo cambian la máquina y su métrica.
      const plan = bloqueContinuo();
      const t = TRAMO_CONTINUO_S - 12;
      return { plan, sim: cuerpoContinuo(), inicio: { i: 0, t, sesionT: t, sesionErgoM: Math.round((t * 500) / 128), ppmMedio: 143 }, dispositivos: MOVIL, maquinaDelPaso: true };
    }
    case 'continuo-bici': {
      const plan = bloqueContinuo();
      const t = 300;
      const parciales = [
        { i: 0, segundos: TRAMO_CONTINUO_S, metros: Math.round((TRAMO_CONTINUO_S * 500) / 128), ppm: 145, hecho: null },
        { i: 1, segundos: TRAMO_CONTINUO_S, metros: Math.round((TRAMO_CONTINUO_S * 500) / 135), ppm: 147, hecho: null },
      ];
      return {
        plan,
        sim: cuerpoContinuo(),
        inicio: { i: 2, t, parciales, sesionErgoM: parciales.reduce((a, x) => a + (x.metros ?? 0), 0) + Math.round((t * 500) / 62), ppmMedio: 145 },
        dispositivos: MOVIL,
        maquinaDelPaso: true,
      };
    }
    case 'libre': {
      // Ronda 2/4, Wall Balls (lo dices tú); a los 3,5 s «Estación hecha» → Row 500 m con el remo; a los 9 s, la Estructura.
      const c = casoCircuito(circuitoLibre(), enLibre(2, 1), 25, 300);
      return {
        c: c.c,
        sim: conMaquina(c.sim, 30, 'remo'),
        inicio: c.inicio,
        dispositivos: MOVIL,
        maquinaDelPaso: true,
        guion: [
          { en: 3500, gesto: 'primaria' },
          { en: 9000, gesto: 'estructura' },
        ],
      };
    }
    case 'hyrox-run':
    default: {
      // Run 5/8 tal como lo trae la 441 (sin objetivo): manda lo que falta; el ritmo actual, en la rejilla.
      const c = casoCircuito(hyrox(), enHyrox(5, 0), 112, RITMO_HYROX, { metros: 400 });
      return { c: c.c, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, maquinaDelPaso: true };
    }
  }
}
