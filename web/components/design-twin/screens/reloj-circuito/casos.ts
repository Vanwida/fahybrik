// LOS CASOS — cada escenario como (circuito, cuerpo, punto de partida, gestos).
// El cuerpo es determinista: el mismo escenario, la misma sesión, segundo a
// segundo. Los tiempos de lo ya hecho (el historial con que arranca cada
// escenario) son del atleta SIMULADO, no de una ejecución real: 493 se hizo en
// 24′ sin un solo parcial guardado, que es justo lo que esta pantalla arregla.

import type { ModeloReloj, MunecaProps, Simulador } from '../../kit-reloj';
import type { InicioCircuito, Parcial } from './motor';
import { dibujoDe, sentidoRoxzone, sesion492, sesion493, sesion506, simulacionHyrox, type Circuito } from './planes';

export interface CasoCircuito {
  c: Circuito;
  sim: Simulador;
  inicio: InicioCircuito;
  inicial?: MunecaProps['inicial'];
  guion?: MunecaProps['guion'];
  modelo?: ModeloReloj;
  /** El atleta girando la corona (reps del AMRAP): cuándo y cuántas. */
  corona?: Array<{ en: number; n: number }>;
}

// ---------------------------------------------------------------------------
// El cuerpo
// ---------------------------------------------------------------------------

const ruido = (t: number, a: number) => Math.sin(t * 1.3) * a * 0.6 + Math.sin(t * 0.37 + 1) * a * 0.4;

/** El /500 del atleta simulado en cada ergo, en s. */
const SPLIT_500: Record<string, number> = { SkiErg: 122, Rowing: 112, Row: 114 };
/** Pulso de crucero por estación (las de trineo y los burpees, arriba). */
const PPM_ESTACION: Record<string, number> = {
  'Sled Push': 174,
  'Sled Pull': 172,
  'Burpee Broad Jump': 176,
  'Wall Balls': 175,
  'Sandbag Lunges': 171,
  'Farmers Carry': 166,
};

/**
 * Lo que tarda el atleta SIMULADO en cada estación que nada mide, a su dosis
 * («nombre@dosis»). Solo sirve para el historial con que arranca un escenario.
 */
const SIM_ESTACION_S: Record<string, number> = {
  'Burpee Broad Jump@40': 112,
  'Wall Balls@25': 64,
  'Sandbag Lunges@50': 104,
  'Sled Push@25': 44,
  'Sled Pull@25': 52,
  'Farmers Carry@100': 50,
  'SkiErg@1000': 252,
  'Sled Push@50': 172,
  'Sled Pull@50': 214,
  'Burpee Broad Jump@80': 243,
  'Row@1000': 236,
  'Farmers Carry@200': 104,
  'Sandbag Lunges@100': 246,
  'Wall Balls@100': 318,
};

interface OpcionesCuerpo {
  /** Ritmo de los tramos de carrera, s/km. */
  ritmoRun: number;
  /** El paso con que arranca el escenario: ahí el pulso ya está asentado. */
  partida: number;
}

/**
 * El cuerpo de un atleta híbrido: corre a su ritmo, rema y hace ski a su /500,
 * y en lo que nada mide (trineos, burpees, lunges) no da ni un metro: el GPS
 * no sabe de un trineo. La Roxzone de salida empieza andando y a los 6 s corre.
 */
export function cuerpo(o: OpcionesCuerpo): Simulador {
  return (p, i, t) => {
    const asentado = o.partida === i ? t + 90 : t;
    const hacia = (obj: number, desde: number, tau: number) => obj - (obj - desde) * Math.exp(-asentado / tau);
    const ppm = (x: number) => Math.round(x + ruido(t + 3, 1.2));
    switch (p.clase) {
      case 'calentamiento':
        return { ritmo: Math.round(335 + ruido(t, 2)), ppm: ppm(hacia(146, 112, 40)), gps: 'listo' };
      case 'carrera':
        return { ritmo: Math.round(o.ritmoRun + ruido(t, 2.5)), ppm: ppm(hacia(170, 160, 25)), gps: 'listo' };
      case 'estacion': {
        const obj = PPM_ESTACION[p.nombre ?? ''] ?? 171;
        if (p.medida.mide === 'ergo') {
          const s = SPLIT_500[p.nombre ?? ''] ?? 118;
          return { ritmo: Math.round(s * 2 + ruido(t, 3)), ppm: ppm(hacia(obj, 164, 30)), gps: 'no-aplica' };
        }
        return { ritmo: null, ppm: ppm(hacia(obj, 164, 30)), gps: 'no-aplica' };
      }
      case 'amrap':
        return { ritmo: null, ppm: ppm(hacia(164, 170, 30)), gps: 'no-aplica' };
      case 'roxzone':
        return sentidoRoxzone(p) === 'salida'
          ? { ritmo: t < 6 ? 690 : Math.round(o.ritmoRun + ruido(t, 2.5)), ppm: ppm(168), gps: 'listo' }
          : { ritmo: null, ppm: ppm(170), gps: 'listo' };
      default:
        return { ritmo: null, ppm: ppm(118 + (172 - 118) * Math.exp(-asentado / 35)), ppmTendencia: 'baja', gps: 'no-aplica' };
    }
  };
}

// ---------------------------------------------------------------------------
// Lo ya hecho cuando arranca el escenario
// ---------------------------------------------------------------------------

/** Los parciales de los pasos anteriores, del atleta simulado (deterministas). */
function historia(c: Circuito, hasta: number, ritmoRun: number, reps: Record<number, number> = {}): Parcial[] {
  return c.plan.pasos.slice(0, hasta).map((p, i) => {
    const vario = 1 + Math.sin(i * 2.1) * 0.04;
    const pr = p.medida.prescrito ?? 0;
    const base = { i, reps: reps[i] ?? null };
    switch (p.clase) {
      case 'carrera': {
        const m = pr + 3;
        const ronda = p.posicion?.ronda?.n ?? 1;
        return { ...base, segundos: Math.round((m / 1000) * ritmoRun * (1 + 0.012 * ronda) * vario), metros: m, ppm: 169 };
      }
      case 'estacion':
        if (p.medida.mide === 'ergo') {
          return { ...base, segundos: Math.round((SPLIT_500[p.nombre ?? ''] ?? 118) * 2 * (pr / 1000)), metros: pr, ppm: 171 };
        }
        return {
          ...base,
          segundos: Math.round((SIM_ESTACION_S[`${p.nombre}@${pr}`] ?? dibujoDe(p)) * vario),
          metros: null,
          ppm: PPM_ESTACION[p.nombre ?? ''] ?? 171,
        };
      case 'roxzone':
        return { ...base, segundos: Math.round((sentidoRoxzone(p) === 'entrada' ? 34 : 17) * vario), metros: null, ppm: 168 };
      case 'amrap':
        return { ...base, segundos: pr, metros: null, ppm: 163 };
      default:
        return { ...base, segundos: pr, metros: null, ppm: 140 };
    }
  });
}

function caso(c: Circuito, i: number, t: number, ritmoRun: number, extra: Partial<CasoCircuito> & { metros?: number; reps?: Record<number, number> } = {}): CasoCircuito {
  const { metros, reps, ...resto } = extra;
  return {
    c,
    sim: cuerpo({ ritmoRun, partida: i }),
    inicio: { i, t, metros, parciales: historia(c, i, ritmoRun, reps), reps, ppmMedio: 162 },
    ...resto,
  };
}

// ---------------------------------------------------------------------------
// Los escenarios
// ---------------------------------------------------------------------------

/** 493: el paso k de la ronda r (0 = Run, 1 = estación, 2 = descanso). */
const en493 = (r: number, k: 0 | 1 | 2) => 1 + (r - 1) * 3 + k;
/** HYROX con Roxzone: el paso k de la estación n (0 = Run, 1 = Roxzone de entrada, 2 = estación, 3 = Roxzone de salida). */
const enHyrox = (n: number, k: 0 | 1 | 2 | 3) => (n - 1) * 4 + k;

const RITMO_493 = 268;
const RITMO_HYROX = 280;
/** Cap del For Time: la 441 no lo trae; 90′ es de ejemplo, para ver dónde va. */
const CAP_EJEMPLO = 90 * 60;

export function casoDe(escenario: string): CasoCircuito {
  switch (escenario) {
    case 'c493-ski':
      return caso(sesion493(), en493(1, 1), 93, RITMO_493, { metros: 380 });
    case 'c493-bbj':
      return caso(sesion493(), en493(2, 1), 72, RITMO_493, { guion: [{ en: 3500, gesto: 'doble-toque' }] });
    case 'c493-descanso':
      return caso(sesion493(), en493(2, 2), 76, RITMO_493);
    case 'c492-ronda5':
      // El descanso tras los Farmers de la ronda 4, con 12 s: viene la ronda 5, que ya no lleva Farmers.
      return caso(sesion492(), 23, 78, RITMO_493);
    case 'c506-amrap':
      return caso(sesion506(), 3, 106, RITMO_493, {
        reps: { 1: 31, 3: 34 },
        corona: [
          { en: 2500, n: 8 },
          { en: 9000, n: 8 },
        ],
      });
    case 'hyrox-carrera':
      return caso(simulacionHyrox({ pm5: true, roxzone: true, cap: CAP_EJEMPLO }), enHyrox(5, 0), 112, RITMO_HYROX, { metros: 400 });
    case 'hyrox-ruta':
      return caso(simulacionHyrox({ pm5: true, roxzone: true, cap: CAP_EJEMPLO }), enHyrox(5, 0), 112, RITMO_HYROX, { metros: 400, inicial: { pagina: 1 } });
    case 'hyrox-roxzone':
      return caso(simulacionHyrox({ pm5: true, roxzone: true, cap: CAP_EJEMPLO }), enHyrox(8, 0), 263, RITMO_HYROX, {
        metros: 940,
        guion: [{ en: 26000, gesto: 'doble-toque' }],
      });
    case 'hyrox-sled':
      return caso(simulacionHyrox({ pm5: true, roxzone: true, cap: CAP_EJEMPLO }), enHyrox(2, 2), 151, RITMO_HYROX, {
        guion: [{ en: 3500, gesto: 'doble-toque' }],
      });
    case 'hyrox-sin-gesto':
      return caso(simulacionHyrox({ pm5: true, roxzone: true, cap: CAP_EJEMPLO }), enHyrox(2, 2), 151, RITMO_HYROX, { modelo: 'sin-gesto' });
    case 'hyrox-ski-pm5':
      return caso(simulacionHyrox({ pm5: true, roxzone: true, cap: CAP_EJEMPLO }), enHyrox(1, 2), 150, RITMO_HYROX, { metros: 615 });
    case 'hyrox-sin-pm5':
      return caso(simulacionHyrox({ pm5: false, roxzone: true, cap: CAP_EJEMPLO }), enHyrox(1, 2), 150, RITMO_HYROX);
    case 'c493-carrera':
    default:
      // A 170 m del final: el preaviso a los 100 m y, al cerrarse solo, «Entras a Burpee Broad Jump».
      return caso(sesion493(), en493(2, 0), 222, RITMO_493, { metros: 830 });
  }
}
