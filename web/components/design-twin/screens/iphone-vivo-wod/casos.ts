// LOS CASOS — cada escenario del WOD como (plan, cuerpo, punto de partida,
// dispositivos, estado de la familia, guion). El 498 (EMOM alterno) y el
// Tabata son los de la muñeca (`screens/reloj-wod/casos.ts`): el mismo estado.
// El remo reporta lo suyo con `conMaquina` (de la gramática): paladas, vatios
// y calorías.

import type { Dispositivos, GestoIphone } from '../../kit-iphone-vivo';
import type { EstadoSecuencia, InicioSecuencia, Parcial, Simulador } from '../../kit-reloj';
import { conMaquina } from '../iphone-vivo-gramatica/casos';
import { casoDe as casoWod } from '../reloj-wod/casos';
import { amrapLibre, amrapRemo, chipperForTime, deathByBurpee } from './planes';
import type { PlanSesion } from '../../kit-reloj';

export interface CasoWodIphone {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  dispositivos: Dispositivos;
  cronoTotal?: (e: EstadoSecuencia) => number | null;
  guion?: Array<{ en: number; gesto: GestoIphone }>;
  /** EMOM y death by: en qué segundo se marcó cada ventana ya hecha, por ÍNDICE de paso. */
  hechas?: Record<number, number>;
  /** AMRAP: en qué segundo de la ventana se cerró cada ronda contada. */
  rondas?: number[];
  /** La campana: el guion de la puntuación (a los N ms, mover las reps). */
  guionReps?: Array<{ en: number; delta: number }>;
}

/** El móvil lleva el motor; el pulso, de una banda. */
const MOVIL: Dispositivos = { reloj: 'sin', maquina: null, pulsometro: 'banda' };

const ruido = (t: number, a: number) => Math.sin(t * 1.3) * a * 0.6 + Math.sin(t * 0.37 + 1) * a * 0.4;
const hacia = (obj: number, desde: number, t: number, tau = 20) => obj - (obj - desde) * Math.exp(-t / tau);
const pm5 = (split: number, t: number) => Math.round(2 * (split + ruido(t, 1.2))) / 2;
const ppm = (x: number, t: number) => Math.round(x + ruido(t + 3, 1));

/** Un parcial de un paso ya hecho (lo que deja el motor al cerrarlo). */
const parcial = (i: number, segundos: number, p: number, extra: Partial<Parcial> = {}): Parcial => ({ i, segundos, metros: null, ppm: p, hecho: null, ...extra });

/** ¿Estás remando? En el AMRAP con remo, el primer minuto de cada ronda (las rondas empiezan en `inicios`). */
function remando(t: number, inicios: number[], dura = 58): boolean {
  const desde = [...inicios].reverse().find((s) => s <= t) ?? 0;
  return t - desde < dura;
}

// ---------------------------------------------------------------------------
// Los escenarios
// ---------------------------------------------------------------------------

export function casoDe(escenario: string): CasoWodIphone {
  switch (escenario) {
    case 'emom-remo': {
      // 498, minuto 4: el remo todo el minuto, con su /500, sus metros y sus calorías.
      const c = casoWod('emom-alterno');
      return {
        plan: c.datos.plan,
        sim: conMaquina(c.sim, 28, 'remo'),
        inicio: { i: 3, t: 24, sesionT: 204, sesionErgoM: 316, metros: 91, ppmMedio: 136, vueltas: c.inicio.vueltas, parciales: [parcial(0, 60, 124), parcial(1, 60, 150, { metros: 225 }), parcial(2, 60, 134)] },
        dispositivos: { ...MOVIL, maquina: 'remo' },
        hechas: { 0: 22, 2: 21 },
      };
    }
    case 'emom-carga': {
      // 498, minuto 5: la Bench Press con su carga; «Hecho» convierte lo que queda en respiro.
      const c = casoWod('emom-alterno');
      return {
        plan: c.datos.plan,
        sim: conMaquina(c.sim, 28, 'remo'),
        inicio: { i: 4, t: 19, sesionT: 259, sesionErgoM: 452, ppmMedio: 138, vueltas: c.inicio.vueltas, parciales: [parcial(0, 60, 124), parcial(1, 60, 150, { metros: 225 }), parcial(2, 60, 134), parcial(3, 60, 156, { metros: 227 })] },
        dispositivos: { ...MOVIL, maquina: 'remo' },
        hechas: { 0: 22, 2: 21 },
        guion: [{ en: 3500, gesto: 'primaria' }],
      };
    }
    case 'amrap-remo': {
      // AMRAP 12′ con 250 m Row: tres rondas contadas, la cuarta a punto; a los 3 s, «+1 ronda».
      const inicios = [0, 138, 281, 430, 575];
      return {
        plan: amrapRemo(),
        sim: (p, _i, t) => {
          if (p.rol !== 'trabajo') return { ritmo: null, ppm: ppm(hacia(132, 170, t, 30), t), ppmTendencia: 'baja', gps: 'no-aplica' };
          return { ritmo: null, split500: remando(t, inicios) ? pm5(126, t) : null, ppm: ppm(168, t), gps: 'no-aplica' };
        },
        inicio: { i: 0, t: 575, sesionT: 575, sesionErgoM: 1000, metros: 1000, ppmMedio: 161 },
        dispositivos: { ...MOVIL, maquina: 'remo' },
        rondas: [138, 281, 430],
        guion: [{ en: 3000, gesto: 'primaria' }],
      };
    }
    case 'amrap-campana': {
      // La campana a los 3 s: cinco rondas contadas; se dicen las reps de la ronda a medias y se guarda.
      const inicios = [0, 138, 281, 430, 575, 700];
      return {
        plan: amrapRemo(),
        sim: (p, _i, t) => {
          if (p.rol !== 'trabajo') return { ritmo: null, ppm: ppm(hacia(132, 172, t, 30), t), ppmTendencia: 'baja', gps: 'no-aplica' };
          return { ritmo: null, split500: remando(t, inicios) ? pm5(126, t) : null, ppm: ppm(172, t), gps: 'no-aplica' };
        },
        inicio: { i: 0, t: 717, sesionT: 717, sesionErgoM: 1250, metros: 1250, ppmMedio: 164 },
        dispositivos: { ...MOVIL, maquina: 'remo' },
        rondas: [138, 281, 430, 575, 700],
        guionReps: [
          { en: 4500, delta: 10 },
          { en: 5400, delta: 6 },
        ],
        guion: [{ en: 8500, gesto: 'primaria' }],
      };
    }
    case 'amrap-libre':
      // Sin coach: el mismo pintor. Nueve rondas de Cindy a los 10:12.
      return {
        plan: amrapLibre(),
        sim: (_p, _i, t) => ({ ritmo: null, ppm: ppm(171, t), gps: 'no-aplica' }),
        inicio: { i: 0, t: 612, sesionT: 612, ppmMedio: 163 },
        dispositivos: MOVIL,
        rondas: [66, 134, 203, 271, 342, 411, 480, 548, 610],
      };
    case 'chipper':
    case 'chipper-cap': {
      const plan = chipperForTime();
      const sim: Simulador = (p, _i, t) => {
        if (p.nombre === 'Row') return { ritmo: null, split500: pm5(118, t), hecho: Math.min(30, Math.floor((t * 30) / 78)), ppm: ppm(hacia(171, 165, t, 15), t), gps: 'no-aplica' };
        if (p.clase === 'carrera') return { ritmo: Math.round(276 + ruido(t, 2)), ppm: ppm(174, t), gps: 'listo' };
        return { ritmo: null, ppm: ppm(hacia(170, 160, t, 20), t), gps: 'no-aplica' };
      };
      // Los parciales de las estaciones ya hechas (los deja el motor al cerrarlas).
      const hechos = [62, 118, 78, 71, 64, 55, 68, 92];
      const parciales = (n: number) => hechos.slice(0, n).map((s, k) => parcial(k, s, 158 + k * 2, k === 2 ? { hecho: 30 } : {}));
      if (escenario === 'chipper-cap') {
        // Estación 9/10 a 23:48: el cap (25′) está a la vista como lo que queda hasta él.
        return {
          plan,
          sim,
          inicio: { i: 8, t: 41, sesionT: 1428, sesionErgoM: 0, ppmMedio: 166, parciales: parciales(8) },
          dispositivos: { ...MOVIL, maquina: 'remo' },
          cronoTotal: (e) => e.sesionT,
        };
      }
      // Estación 2/10 (Wall Ball, lo dices tú); a los 3,5 s «Estación hecha» → el Row por calorías, que se cierra solo.
      return {
        plan,
        sim,
        inicio: { i: 1, t: 48, sesionT: 110, ppmMedio: 152, parciales: parciales(1) },
        dispositivos: { ...MOVIL, maquina: 'remo' },
        cronoTotal: (e) => e.sesionT,
        guion: [{ en: 3500, gesto: 'primaria' }],
      };
    }
    case 'tabata': {
      // Ronda 4/8, trabajo: las tres rondas anteriores dejaron su parcial (el pulso medio de la 3 sale en la rejilla).
      const c = casoWod('tabata');
      return {
        plan: c.datos.plan,
        sim: c.sim,
        inicio: { ...c.inicio, parciales: [parcial(0, 20, 168), parcial(1, 10, 171), parcial(2, 20, 174), parcial(3, 10, 173), parcial(4, 20, 177), parcial(5, 10, 175)] },
        dispositivos: MOVIL,
      };
    }
    case 'tabata-descanso': {
      const c = casoWod('tabata');
      return {
        plan: c.datos.plan,
        sim: c.sim,
        inicio: { i: 7, t: 2, sesionT: 112, ppmMedio: 165, parciales: [parcial(0, 20, 168), parcial(1, 10, 171), parcial(2, 20, 174), parcial(3, 10, 173), parcial(4, 20, 177), parcial(5, 10, 175), parcial(6, 20, 178)] },
        dispositivos: MOVIL,
      };
    }
    case 'deathby-cazado': {
      // Minuto 10 (10 burpees) a 3 s del final, sin marcar: el reloj te caza y la puntuación son 9 minutos.
      const plan = deathByBurpee();
      return {
        plan,
        sim: (_p, _i, t) => ({ ritmo: null, ppm: ppm(hacia(181, 176, t, 20), t), gps: 'no-aplica' }),
        inicio: { i: 9, t: 57, sesionT: 597, ppmMedio: 158, parciales: Array.from({ length: 9 }, (_, k) => parcial(k, 60, 128 + k * 6)) },
        dispositivos: MOVIL,
        hechas: { 0: 6, 1: 9, 2: 13, 3: 18, 4: 24, 5: 31, 6: 37, 7: 45, 8: 52 },
      };
    }
    case 'deathby':
    default: {
      // Minuto 7 (7 burpees) a los 19 s; a los 3,5 s «Hecho»: lo que queda del minuto es respiro.
      const plan = deathByBurpee();
      return {
        plan,
        sim: (_p, _i, t) => ({ ritmo: null, ppm: ppm(hacia(172, 165, t, 20), t), gps: 'no-aplica' }),
        inicio: { i: 6, t: 19, sesionT: 379, ppmMedio: 148, parciales: Array.from({ length: 6 }, (_, k) => parcial(k, 60, 128 + k * 6)) },
        dispositivos: MOVIL,
        hechas: { 0: 6, 1: 9, 2: 13, 3: 18, 4: 24, 5: 31 },
        guion: [{ en: 3500, gesto: 'primaria' }],
      };
    }
  }
}
