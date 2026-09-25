// LOS CASOS — cada escenario de «Muñeca · correr» como (plan, cuerpo, punto de
// partida). El cuerpo es determinista: el mismo escenario, la misma carrera,
// segundo a segundo, para que lo que se juzga se pueda repetir.

import type { EstadoGps, InicioSecuencia, PasoBase, Simulador, Vuelta } from '../../kit-reloj';
import {
  indice509,
  sesion479,
  sesion491,
  sesion494,
  sesion509,
  sesion535,
  sesion538,
  sesion551,
  sesion573,
  seisPorMil,
  type PlanCorrer,
} from './planes';

export interface CasoCorrer {
  datos: PlanCorrer;
  sim: Simulador;
  inicio: InicioSecuencia;
  muneca?: 'arriba' | 'abajo';
}

// ---------------------------------------------------------------------------
// El cuerpo
// ---------------------------------------------------------------------------

/** Ruido suave y determinista: un GPS y un pulso de verdad nunca están quietos. */
const ruido = (t: number, a: number) => Math.sin(t * 1.3) * a * 0.6 + Math.sin(t * 0.37 + 1) * a * 0.4;

/** Ritmo de crucero por zona, s/km, para un atleta de umbral 170 ppm. */
const RITMO_ZONA: Record<number, number> = { 1: 360, 2: 328, 3: 300, 4: 250, 5: 208 };
/** Pulso de crucero por zona. */
const PPM_ZONA: Record<number, number> = { 1: 132, 2: 145, 3: 156, 4: 168, 5: 177 };

function ritmoBase(p: PasoBase): number | null {
  if (p.rol === 'descanso' || p.clase === 'movilidad' || p.medida.mide === 'atleta') return null;
  if (p.rol === 'recuperacion') return p.modoRecupera === 'andar' ? 600 : p.modoRecupera === 'parado' ? null : 370;
  const o = p.objetivos.find((x) => x.papel === 'principal');
  if (o?.eje === 'ritmo' && o.min != null && o.max != null) return (o.min + o.max) / 2;
  if (o?.eje === 'zona') return RITMO_ZONA[o.max ?? 2] ?? 330;
  if (o?.eje === 'rpe') return 200;
  if (p.clase === 'calentamiento') return p.entorno === 'cinta' ? 420 : 330;
  if (p.clase === 'vuelta-calma') return 360;
  return 240;
}

function ppmBase(p: PasoBase): number {
  const o = p.objetivos.find((x) => x.papel === 'principal');
  if (p.rol !== 'trabajo') return 128;
  if (o?.eje === 'zona') return PPM_ZONA[o.max ?? 2] ?? 145;
  if (o?.eje === 'rpe') return 166;
  if (o?.eje === 'ritmo') return (o.min ?? 300) < 260 ? 171 : 158;
  if (p.fase !== 'principal') return 140;
  return 172;
}

interface Opciones {
  /** Sustituye el ritmo del cuerpo (s/km) en un paso concreto. */
  ritmo?: (p: PasoBase, i: number, t: number) => number | null | undefined;
  gps?: (sesionT: number) => EstadoGps;
  /** El pulso con que se llega al paso de partida (para no empezar en frío). */
  ppmDesde?: number;
  /** Paso de partida y su t: allí el pulso arranca ya asentado. */
  partida?: { i: number; t: number };
}

/**
 * El cuerpo de un corredor: ritmo de crucero por paso con ruido, pulso que
 * sube hacia su zona al empezar el trabajo y baja en la recuperación.
 */
export function cuerpo(o: Opciones = {}): Simulador {
  return (p, i, t, sesionT) => {
    const gps: EstadoGps = p.entorno === 'cinta' ? 'no-aplica' : (o.gps?.(sesionT) ?? 'listo');
    const propio = o.ritmo?.(p, i, t);
    const r0 = propio !== undefined ? propio : ritmoBase(p);
    const ritmo = r0 == null || gps === 'buscando' ? null : Math.round(r0 + ruido(t, r0 > 400 ? 6 : 1.6));
    const obj = ppmBase(p);
    // En el paso de partida el pulso ya está donde tiene que estar.
    const asentado = o.partida && o.partida.i === i ? t + 60 : t;
    let ppm: number;
    if (p.rol === 'trabajo') ppm = obj - (obj - (o.ppmDesde ?? 138)) * Math.exp(-asentado / 22);
    else ppm = obj + (172 - obj) * Math.exp(-asentado / 32);
    return {
      ritmo,
      ppm: Math.round(ppm + ruido(t + 3, 1.2)),
      ppmTendencia: p.rol === 'trabajo' ? undefined : 'baja',
      gps,
    };
  };
}

// ---------------------------------------------------------------------------
// Vueltas ya hechas cuando arranca el escenario
// ---------------------------------------------------------------------------

const serie = (n: number, segundos: number, metros: number, ppm: number, eje: 'ritmo' | 'zona' = 'ritmo', tanda?: number): Vuelta => ({
  n,
  tanda,
  clase: 'serie',
  segundos,
  metros,
  ritmo: segundos / (metros / 1000),
  ppm,
  veredicto: 'dentro',
  eje,
});

const km = (n: number, segundos: number, ppm: number): Vuelta => ({ n, clase: 'km', segundos, metros: 1000, ritmo: segundos, ppm, veredicto: null });

const seriesSinObjetivo = (tanda: number, hasta: number): Vuelta[] =>
  Array.from({ length: hasta }, (_, k) => ({ n: k + 1, tanda, clase: 'serie' as const, segundos: 60, metros: 250, ritmo: 240, ppm: 170 + k, veredicto: null }));

// ---------------------------------------------------------------------------
// Los escenarios
// ---------------------------------------------------------------------------

export function casoDe(escenario: string): CasoCorrer {
  switch (escenario) {
    case 'serie-rapida':
      return {
        datos: seisPorMil(),
        // Se va a 3:38 entre el segundo 46 y el 64 y vuelve a la banda: el
        // aviso «afloja» sale UNA vez (cadencia del coach: 20 s).
        sim: cuerpo({
          partida: { i: 5, t: 40 },
          ppmDesde: 150,
          ritmo: (p, i, t) => {
            if (i !== 5) return undefined;
            if (t < 44) return 230;
            if (t < 50) return 230 - (t - 44) * 2;
            if (t < 64) return 218;
            if (t < 70) return 218 + (t - 64) * 2.2;
            return 231;
          },
        }),
        inicio: { i: 5, t: 40, metros: 174, sesionT: 1579, sesionM: 5375, vueltas: [serie(1, 231, 1000, 169), serie(2, 228, 1000, 171)], ppmMedio: 151 },
      };
    case 'recupera-go':
      return {
        datos: seisPorMil(),
        sim: cuerpo({ partida: { i: 6, t: 76 } }),
        inicio: { i: 6, t: 76, sesionT: 1844, sesionM: 6401, vueltas: [serie(1, 231, 1000, 169), serie(2, 228, 1000, 171), serie(3, 229, 1000, 172)], ppmMedio: 152 },
      };
    case 'serie-z5':
      return {
        datos: sesion479(),
        sim: cuerpo({ partida: { i: 3, t: 96 }, ritmo: (p, i) => (i === 3 ? 208 : undefined) }),
        inicio: { i: 3, t: 96, metros: 460, sesionT: 714, sesionM: 2564, vueltas: [serie(1, 168, 800, 175, 'zona')], ppmMedio: 158 },
      };
    case 'rodaje-z2':
      return {
        datos: sesion491(),
        sim: cuerpo({ partida: { i: 0, t: 754 } }),
        inicio: { i: 0, t: 754, sesionT: 754, sesionM: 2299, vueltas: [km(1, 331, 141), km(2, 327, 144)], ppmMedio: 143 },
      };
    case 'tirada-z2':
      return {
        datos: sesion494(),
        sim: cuerpo({ partida: { i: 0, t: 1450 }, ritmo: () => 292 }),
        inicio: {
          i: 0,
          t: 1450,
          sesionT: 1450,
          sesionM: 4966,
          kmDesdeT: 1168,
          vueltas: [km(1, 295, 139), km(2, 293, 143), km(3, 291, 145), km(4, 289, 146)],
          ppmMedio: 143,
        },
      };
    case 'tempo-z4':
      return {
        datos: sesion573(),
        sim: cuerpo({ partida: { i: 0, t: 434 } }),
        inicio: { i: 0, t: 434, metros: 1770, sesionT: 434, sesionM: 1770, ppmMedio: 163 },
      };
    case 'strides':
      return {
        datos: sesion551(),
        sim: cuerpo({ ppmDesde: 148 }),
        inicio: { i: 5, t: 8, sesionT: 2136, sesionM: 6440, ppmMedio: 146 },
      };
    case 'progresivo':
      return {
        datos: sesion538(),
        sim: cuerpo({ partida: { i: 2, t: 24 } }),
        inicio: {
          i: 2,
          t: 24,
          sesionT: 684,
          sesionM: 2176,
          vueltas: [
            { n: 1, clase: 'tramo', segundos: 600, metros: 1875, ritmo: 320, ppm: 146, veredicto: 'dentro', eje: 'ritmo' },
            { n: 2, clase: 'tramo', segundos: 60, metros: 214, ritmo: 280, ppm: 155, veredicto: 'dentro', eje: 'ritmo' },
          ],
          ppmMedio: 147,
        },
      };
    case 'gps':
      return {
        datos: sesion538(),
        // Arranca sin esperar a «GPS listo»: siete segundos buscando.
        sim: cuerpo({ ppmDesde: 112, gps: (s) => (s < 7 ? 'buscando' : 'listo'), ritmo: (p, i) => (i === 0 ? 322 : undefined) }),
        inicio: { i: 0, t: 0, sesionT: 0, sesionM: 0 },
      };
    case 'tanda-serie': {
      const i = indice509(2, 4);
      return {
        datos: sesion509(),
        sim: cuerpo({ partida: { i, t: 52 } }),
        inicio: { i, t: 52, metros: 217, sesionT: 1852, sesionM: 4410, vueltas: [...seriesSinObjetivo(1, 6), ...seriesSinObjetivo(2, 3)], ppmMedio: 150 },
      };
    }
    case 'tanda-descanso': {
      const i = indice509(2, 6);
      return {
        datos: sesion509(),
        sim: cuerpo({ partida: { i, t: 54 } }),
        inicio: { i, t: 54, metros: 225, sesionT: 2094, sesionM: 5118, vueltas: [...seriesSinObjetivo(1, 6), ...seriesSinObjetivo(2, 5)], ppmMedio: 152 },
      };
    }
    case 'cinta':
      return {
        datos: sesion535(),
        sim: cuerpo({ partida: { i: 2, t: 48 }, ritmo: (p) => (p.rol === 'trabajo' ? 250 : undefined) }),
        inicio: { i: 2, t: 48, metros: 192, sesionT: 288, sesionM: 1005, vueltas: [serie(1, 120, 480, 166, 'zona', 1)], ppmMedio: 152 },
      };
    case 'always-on':
      return { ...casoDe('serie-dentro'), muneca: 'abajo' };
    case 'serie-dentro':
    default:
      return {
        datos: seisPorMil(),
        sim: cuerpo({ partida: { i: 5, t: 88 } }),
        inicio: { i: 5, t: 88, metros: 380, sesionT: 1627, sesionM: 5581, vueltas: [serie(1, 231, 1000, 169), serie(2, 228, 1000, 171)], ppmMedio: 152 },
      };
  }
}
