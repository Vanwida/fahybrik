// LOS CASOS — cada escenario de «Muñeca · fuerza» como (plan, cuerpo, punto
// de partida, lo ya declarado y los gestos guionizados). El cuerpo es
// determinista: el mismo escenario, la misma sesión, segundo a segundo.

import type { GestoGuion, InicioSecuencia, ModeloReloj, MunecaProps, PasoBase, PlanSesion, Simulador, Vuelta } from '../../kit-reloj';
import type { Campo, Registro } from './anotar';
import { ejemploP11, indiceDe, sesion488, sesion492, sesion529, sesion538 } from './planes';

export type AccionGuion =
  | { tipo: 'abrir'; serie: number }
  | { tipo: 'foco'; campo: Campo }
  | { tipo: 'corona'; dir: 1 | -1 }
  | { tipo: 'resumen' };

export interface CasoFuerza {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  /** Lo ya declarado antes de que arranque el escenario. */
  registro: Registro;
  /** Velocidad media de la barra por rep (m/s) y su confianza, si el sensor la mide. */
  velocidad?: { porRep: number[]; confianza: 'alta' | 'media' | 'baja' };
  /** Gestos de la carcasa (doble toque, corona, muñeca…). */
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  /** Gestos de la anotación (tocar un dato, girar la corona con foco). */
  acciones?: Array<{ en: number; accion: AccionGuion }>;
  inicial?: MunecaProps['inicial'];
  modelo?: ModeloReloj;
}

// ---------------------------------------------------------------------------
// El cuerpo
// ---------------------------------------------------------------------------

const ruido = (t: number, a: number) => Math.sin(t * 1.3) * a * 0.6 + Math.sin(t * 0.37 + 1) * a * 0.4;

const porRep = (p: PasoBase) => (p.tempo ? p.tempo.excentrica + p.tempo.pausaAbajo + p.tempo.concentrica + p.tempo.pausaArriba : 3);

/** Lo que cuenta el sensor con la serie abierta: la primera rep a los 3 s + una por ciclo del tempo. */
export function repsSensor(p: PasoBase, t: number): number {
  return Math.max(0, Math.min(p.medida.prescrito ?? 0, Math.floor((t - 3) / porRep(p))));
}

/** El pulso sube en la serie y baja en el descanso; el sensor cuenta si la serie es suya. */
export const cuerpo: Simulador = (p, _i, t) => {
  if (p.rol === 'descanso') return { ritmo: null, ppm: Math.round(102 + 50 * Math.exp(-t / 35) + ruido(t, 1)), ppmTendencia: 'baja', gps: 'no-aplica' };
  if (p.rol === 'trabajo' && p.clase === 'fuerza')
    return { ritmo: null, ppm: Math.round(Math.min(156, 116 + t * 1.4) + ruido(t, 1)), gps: 'no-aplica', hecho: p.medida.mide === 'sensor' ? repsSensor(p, t) : null };
  if (p.rol === 'trabajo' && p.clase !== 'movilidad') return { ritmo: Math.round(330 + ruido(t, 3)), ppm: Math.round(142 + ruido(t, 1)), gps: 'listo' };
  return { ritmo: null, ppm: Math.round(122 + ruido(t, 1)), gps: 'no-aplica' };
};

// ---------------------------------------------------------------------------
// El punto de partida: lo ya hecho deja sus vueltas y su tiempo
// ---------------------------------------------------------------------------

function segundosDe(p: PasoBase): number {
  if (p.rol !== 'trabajo') return p.medida.prescrito ?? 0;
  if (p.medida.tipo === 'tiempo') return p.medida.prescrito ?? 30;
  if (p.medida.mide === 'sensor') return 3 + porRep(p) * (p.medida.prescrito ?? 0) + 2;
  if (p.medida.tipo === 'reps') return 12 + (p.medida.prescrito ?? 0) * 3;
  if (p.medida.tipo === 'abierta') return 300;
  return 45;
}

function inicioEn(plan: PlanSesion, i: number, t: number): InicioSecuencia {
  const vueltas: Vuelta[] = [];
  let sesionT = 0;
  plan.pasos.slice(0, i).forEach((p) => {
    const s = segundosDe(p);
    sesionT += s;
    const serie = p.posicion?.serie ?? p.posicion?.tramo;
    if (p.rol === 'trabajo' && p.fase === 'principal' && serie) {
      vueltas.push({ n: serie.n, clase: 'serie', segundos: s, metros: null, ritmo: null, ppm: 138, veredicto: null });
    }
  });
  return { i, t, sesionT: sesionT + t, vueltas, ppmMedio: 124 };
}

const reps = (n: number, kg?: number, esfuerzo?: number) => ({ reps: n, ...(kg != null ? { kg } : {}), ...(esfuerzo != null ? { esfuerzo } : {}) });

/** 529 · las rondas 1–3 de A declaradas: 125, 127,5, 127,5 kg; los saltos, 6. */
const A_TRES_RONDAS: Registro = {
  '529-A1-s1': reps(8, 125),
  '529-A2-s1': reps(6),
  '529-A1-s2': reps(8, 127.5),
  '529-A2-s2': reps(6),
  '529-A1-s3': reps(8, 127.5),
  '529-A2-s3': reps(6),
};

// ---------------------------------------------------------------------------
// Los escenarios
// ---------------------------------------------------------------------------

export function casoDe(escenario: string): CasoFuerza {
  switch (escenario) {
    case 'ronda': {
      const plan = sesion529();
      return { plan, sim: cuerpo, inicio: inicioEn(plan, indiceDe(plan, '529-A2-s1') + 1, 95), registro: {}, guion: [{ en: 3200, gesto: 'doble-toque' }] };
    }
    case 'ultima': {
      const plan = sesion529();
      return {
        plan,
        sim: cuerpo,
        inicio: inicioEn(plan, indiceDe(plan, '529-A2-s4'), 5),
        registro: A_TRES_RONDAS,
        guion: [
          { en: 2000, gesto: 'doble-toque' },
          { en: 9000, gesto: 'doble-toque' },
          { en: 12500, gesto: 'doble-toque' },
        ],
      };
    }
    case 'aproximacion': {
      const plan = sesion488();
      return {
        plan,
        sim: cuerpo,
        inicio: inicioEn(plan, indiceDe(plan, '488-bs-a2'), 4),
        registro: {},
        guion: [
          { en: 3000, gesto: 'doble-toque' },
          { en: 9500, gesto: 'doble-toque' },
        ],
      };
    }
    case 'anotar': {
      const plan = sesion488();
      return {
        plan,
        sim: cuerpo,
        inicio: inicioEn(plan, indiceDe(plan, '488-bs-s2') + 1, 10),
        registro: { '488-bs-s1': reps(6, 135, 6.5) },
        acciones: [
          { en: 2500, accion: { tipo: 'foco', campo: 'reps' } },
          { en: 3600, accion: { tipo: 'corona', dir: -1 } },
          { en: 5200, accion: { tipo: 'foco', campo: 'esfuerzo' } },
          { en: 6300, accion: { tipo: 'corona', dir: 1 } },
        ],
        guion: [{ en: 8500, gesto: 'doble-toque' }],
      };
    }
    case 'cascada': {
      const plan = sesion492();
      return {
        plan,
        sim: cuerpo,
        inicio: inicioEn(plan, indiceDe(plan, '492-dl-s1') + 1, 8),
        registro: {},
        acciones: [
          { en: 2000, accion: { tipo: 'foco', campo: 'kg' } },
          { en: 3000, accion: { tipo: 'corona', dir: 1 } },
          { en: 4000, accion: { tipo: 'corona', dir: 1 } },
        ],
        guion: [
          { en: 6000, gesto: 'doble-toque' },
          { en: 8500, gesto: 'corona-abajo' },
        ],
      };
    }
    case 'isometria': {
      const plan = sesion538();
      return {
        plan,
        sim: cuerpo,
        inicio: inicioEn(plan, indiceDe(plan, '538-A2-s2') - 1, 0),
        registro: { '538-A1-s1': reps(10), '538-A3-s1': reps(10), '538-A4-s1': reps(3) },
      };
    }
    case 'deshacer': {
      const plan = sesion529();
      const registro: Registro = { ...A_TRES_RONDAS };
      delete registro['529-A1-s3'];
      delete registro['529-A2-s3'];
      return { plan, sim: cuerpo, inicio: inicioEn(plan, indiceDe(plan, '529-A1-s3'), 4), registro, guion: [{ en: 1500, gesto: 'doble-toque' }] };
    }
    case 'sensor': {
      const plan = ejemploP11();
      return {
        plan,
        sim: cuerpo,
        inicio: inicioEn(plan, indiceDe(plan, 'p11-bs-s3'), 0),
        registro: { 'p11-bs-s1': reps(5, 100, 2), 'p11-bs-s2': reps(5, 100, 2) },
        velocidad: { porRep: [0.72, 0.7, 0.68, 0.65, 0.61], confianza: 'media' },
        guion: [{ en: 29500, gesto: 'doble-toque' }],
      };
    }
    case 'ejercicios': {
      const plan = sesion529();
      return {
        plan,
        sim: cuerpo,
        inicio: inicioEn(plan, indiceDe(plan, '529-B1-s2'), 10),
        registro: { ...A_TRES_RONDAS, '529-A1-s4': reps(7, 127.5), '529-A2-s4': reps(6), '529-B1-s1': reps(8, 140, 3) },
        inicial: { pagina: 1 },
        guion: [{ en: 3500, gesto: 'corona-abajo' }],
      };
    }
    case 'tmp-ronda538': {
      const plan = sesion538();
      return { plan, sim: cuerpo, inicio: inicioEn(plan, indiceDe(plan, '538-A4-s2') + 1, 5), registro: {}, acciones: [{ en: 2500, accion: { tipo: 'abrir', serie: 1 } }] };
    }
    case 'sin-gesto': {
      const plan = sesion529();
      return { plan, sim: cuerpo, inicio: inicioEn(plan, indiceDe(plan, '529-A1-s1'), 6), registro: {}, modelo: 'sin-gesto' };
    }
    default: {
      // 'superserie' — 529, A1 serie 1/4 y, con doble toque, A2 sin descanso.
      const plan = sesion529();
      return { plan, sim: cuerpo, inicio: inicioEn(plan, indiceDe(plan, '529-A1-s1'), 6), registro: {}, guion: [{ en: 4200, gesto: 'doble-toque' }] };
    }
  }
}
