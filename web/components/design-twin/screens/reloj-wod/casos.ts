// LOS CASOS — cada escenario como (plan, cuerpo, punto de partida). El cuerpo
// es determinista: el mismo escenario, el mismo WOD, segundo a segundo. Los
// ergómetros dan su /500 al motor como ritmo por km (× 2): así el motor cuenta
// los metros y cierra la serie al llegar, igual que con el GPS.

import type { GestoGuion, InicioSecuencia, ModeloReloj, Simulador, Vuelta } from '../../kit-reloj';
import {
  amrap15,
  bike514,
  carrera552,
  chipper506,
  emom498,
  emom572,
  ergo505,
  ergo530,
  escalera536,
  forTimeWod,
  tabata,
  wodDe,
  type PlanWod,
} from './planes';
import type { WodInicial } from './vivo';

export interface CasoWod {
  datos: PlanWod;
  sim: Simulador;
  inicio: InicioSecuencia;
  wod?: WodInicial;
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  modelo?: ModeloReloj;
}

// ---------------------------------------------------------------------------
// El cuerpo
// ---------------------------------------------------------------------------

const ruido = (t: number, a: number) => Math.sin(t * 1.3) * a * 0.6 + Math.sin(t * 0.37 + 1) * a * 0.4;

/** El pulso va hacia `obj` con retraso (τ s): el corazón llega tarde a todo. */
const hacia = (obj: number, desde: number, t: number, tau = 20) => obj - (obj - desde) * Math.exp(-t / tau);

/** Un /500 del PM5, dado al motor como s/km. */
const pm5 = (split: number, t: number) => Math.round(2 * (split + ruido(t, 1.2)));

const ppm = (x: number, t: number) => Math.round(x + ruido(t + 3, 1));

const serie = (n: number, segundos: number, metros: number | null, p: number, eje: Vuelta['eje'] = 'split500'): Vuelta => ({
  n,
  clase: 'serie',
  segundos,
  metros,
  ritmo: metros ? segundos / (metros / 1000) : null,
  ppm: p,
  veredicto: null,
  eje,
});

// ---------------------------------------------------------------------------
// Los escenarios
// ---------------------------------------------------------------------------

export function casoDe(escenario: string): CasoWod {
  switch (escenario) {
    case 'emom-75': {
      // 572: la ventana 9 es la de correr (en cinta); la 10, remo con PM5.
      return {
        datos: emom572(),
        sim: (p, _i, t) =>
          p.nombre === 'Run'
            ? { ritmo: Math.round(305 + ruido(t, 1.2)), ppm: ppm(hacia(166, 160, t + 30, 15), t), gps: 'no-aplica' }
            : { ritmo: pm5(p.nombre === 'Row' ? 125 : 132, t), ppm: ppm(hacia(162, 166, t, 18), t), gps: 'no-aplica' },
        inicio: {
          i: 8,
          t: 62,
          metros: 203,
          sesionT: 662,
          sesionM: 2263,
          ppmMedio: 152,
          vueltas: [serie(1, 75, 300, 148), serie(2, 75, 284, 155), serie(3, 75, 246, 160), serie(4, 75, 300, 158), serie(5, 75, 284, 161), serie(6, 75, 246, 163), serie(7, 75, 300, 161), serie(8, 75, 284, 163)].map((v) => ({ ...v, eje: undefined })),
        },
      };
    }
    case 'amrap-15':
    case 'amrap-boton':
      return {
        datos: amrap15(),
        sim: (_p, _i, t) => ({ ritmo: null, ppm: ppm(165, t), gps: 'no-aplica' }),
        inicio: { i: 0, t: 522, sesionT: 522, ppmMedio: 158 },
        wod: { rondas: { 0: [104, 213, 326, 444] } },
        modelo: escenario === 'amrap-boton' ? 'sin-gesto' : undefined,
      };
    case 'amrap-campana':
      return {
        datos: amrap15(),
        sim: (p, _i, t) => ({ ritmo: null, ppm: ppm(p.rol === 'trabajo' ? 170 : hacia(128, 170, t, 30), t), ppmTendencia: p.rol === 'trabajo' ? undefined : 'baja', gps: 'no-aplica' }),
        inicio: { i: 0, t: 889, sesionT: 889, ppmMedio: 162 },
        wod: { rondas: { 0: [104, 213, 326, 444, 566, 690, 817] } },
      };
    case 'amrap-506':
      // 506: AMRAP 4′ de Pull-up (ronda 1/4), la puntuación en la transición y el Run 800 @RPE 8.
      return {
        datos: chipper506(),
        sim: (p, _i, t) => {
          if (p.clase === 'carrera') return { ritmo: Math.round(232 + ruido(t, 2)), ppm: ppm(hacia(170, 140, t, 20), t), gps: 'listo' };
          if (p.rol === 'transicion') return { ritmo: null, ppm: ppm(hacia(130, 156, t, 25), t), ppmTendencia: 'baja', gps: 'listo' };
          return { ritmo: null, ppm: ppm(156, t), gps: 'no-aplica' };
        },
        inicio: { i: 1, t: 229, sesionT: 434, sesionM: 800, ppmMedio: 158 },
      };
    case 'fortime':
      return {
        datos: forTimeWod(),
        sim: (p, _i, t) =>
          wodDe(p)?.formato === 'fortime' && p.nombre === 'Row'
            ? { ritmo: pm5(122, t), ppm: ppm(166, t), gps: 'no-aplica' }
            : { ritmo: null, ppm: ppm(hacia(172, 166, t, 15), t), gps: 'no-aplica' },
        inicio: { i: 6, t: 107, metros: 440, sesionT: 850, sesionM: 1440, ppmMedio: 163 },
      };
    case 'carrera-5k':
      return {
        datos: carrera552(),
        sim: (_p, _i, t) => ({ ritmo: Math.round(248 + ruido(t, 1.6)), ppm: ppm(177, t), gps: 'listo' }),
        inicio: {
          i: 0,
          t: 989,
          metros: 3940,
          sesionT: 989,
          sesionM: 3940,
          kmDesdeT: 753,
          ppmMedio: 173,
          vueltas: [
            { n: 1, clase: 'km', segundos: 248, metros: 1000, ritmo: 248, ppm: 169, veredicto: null },
            { n: 2, clase: 'km', segundos: 252, metros: 1000, ritmo: 252, ppm: 174, veredicto: null },
            { n: 3, clase: 'km', segundos: 253, metros: 1000, ritmo: 253, ppm: 176, veredicto: null },
          ],
        },
      };
    case 'ergo-sin-pm5':
      return {
        datos: ergo505(false),
        sim: (p, _i, t) => ({ ritmo: null, ppm: ppm(p.rol === 'trabajo' ? hacia(158, 142, t, 20) : hacia(128, 158, t, 30), t), ppmTendencia: p.rol === 'trabajo' ? undefined : 'baja', gps: 'no-aplica' }),
        inicio: { i: 4, t: 41, sesionT: 252, ppmMedio: 144, vueltas: [serie(1, 59, null, 147), serie(2, 62, null, 151)] },
      };
    case 'ergo-530':
      return {
        datos: ergo530(),
        sim: (p, _i, t) => {
          if (p.clase === 'rodaje') return { ritmo: Math.round(330 + ruido(t, 2)), ppm: ppm(145, t), gps: 'listo' };
          const split = p.nombre === 'SkiErg' ? 138 : 136;
          return { ritmo: p.nombre === 'Assault Bike' ? null : pm5(split, t), ppm: ppm(hacia(144, 141, t, 20), t), gps: 'no-aplica' };
        },
        inicio: { i: 4, t: 48, metros: 176, sesionT: 528, sesionM: 1487, ppmMedio: 139 },
      };
    case 'ergo-escalera': {
      // Z2 146 → Z3 156 → Z4 168: el pulso llega tarde a cada escalón.
      const obj = [146, 156, 168];
      const split = [128, 120, 112];
      return {
        datos: escalera536(),
        sim: (p, i, t) => {
          if (p.rol !== 'trabajo') return { ritmo: null, ppm: ppm(hacia(126, 168, t, 30), t), ppmTendencia: 'baja', gps: 'no-aplica' };
          return { ritmo: pm5(split[i] ?? 120, t), ppm: ppm(hacia(obj[i] ?? 150, i === 1 ? 148 : 156, t, 15), t), gps: 'no-aplica' };
        },
        inicio: {
          i: 1,
          t: 47,
          metros: 196,
          sesionT: 137,
          sesionM: 548,
          ppmMedio: 146,
          vueltas: [{ n: 1, clase: 'tramo', segundos: 90, metros: 352, ritmo: 256, ppm: 145, veredicto: 'dentro', eje: 'zona' }],
        },
      };
    }
    case 'ergo-514':
      return {
        datos: bike514(),
        // A los 6 s se va de 134 a 146 (por encima de los 142 del coach) y a los 26 vuelve.
        sim: (_p, _i, t) => {
          const s = t - 828;
          const base = s < 6 ? 134 : s < 12 ? 134 + (s - 6) * 2 : s < 26 ? 146 : s < 34 ? 146 - (s - 26) * 1.4 : 135;
          return { ritmo: null, ppm: ppm(base, t), gps: 'no-aplica' };
        },
        inicio: { i: 0, t: 828, sesionT: 828, ppmMedio: 131 },
      };
    case 'tabata':
      return {
        datos: tabata(),
        sim: (p, _i, t) => ({ ritmo: null, ppm: ppm(p.rol === 'trabajo' ? hacia(178, 170, t, 10) : hacia(168, 177, t, 20), t), gps: 'no-aplica' }),
        inicio: { i: 6, t: 12, sesionT: 102, ppmMedio: 163 },
      };
    case 'ergo-505':
      return {
        datos: ergo505(true),
        // Serie 3 a 1:59 (lo que hizo en la real: 1:59, 1:59, 2:06, 1:51), afloja
        // tras el aviso y entra a 2:04; la serie 4, dentro.
        sim: (p, i, t) => {
          if (p.rol !== 'trabajo') return { ritmo: null, ppm: ppm(hacia(130, 160, t, 30), t), ppmTendencia: 'baja', gps: 'no-aplica' };
          const split = i !== 4 ? 124 : t < 38 ? 119 : t < 44 ? 119 + (t - 38) * 0.85 : 124;
          return { ritmo: pm5(split, t), ppm: ppm(hacia(160, 142, t, 20), t), gps: 'no-aplica' };
        },
        inicio: { i: 4, t: 30, metros: 126, sesionT: 238, sesionM: 626, ppmMedio: 145, vueltas: [serie(1, 59, 250, 147), serie(2, 60, 250, 151)] },
      };
    case 'emom-alterno':
    default:
      // 498: minuto 3 (Bench Press); a los 3,5 s el doble toque marca la tarea.
      return {
        datos: emom498(),
        sim: (p, _i, t) => {
          const w = wodDe(p);
          if (w?.formato === 'emom' && !w.tarea.dosis) return { ritmo: pm5(132, t), ppm: ppm(hacia(158, 130, t, 18), t), gps: 'no-aplica' };
          const x = t < 24 ? hacia(136, 124, t, 10) : 136 - (t - 24) * 0.3;
          return { ritmo: null, ppm: ppm(x, t), gps: 'no-aplica' };
        },
        inicio: {
          i: 2,
          t: 19,
          sesionT: 139,
          sesionM: 225,
          ppmMedio: 134,
          vueltas: [
            { ...serie(1, 60, null, 124), eje: undefined },
            { ...serie(2, 60, 225, 150), eje: undefined },
          ],
        },
        wod: { hechas: { 0: 22 } },
        guion: [{ en: 3500, gesto: 'doble-toque' }],
      };
  }
}
