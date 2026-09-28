// LOS CASOS — cada escenario de «iPhone · fuerza» como (plan, cuerpo, punto
// de partida, lo ya declarado, dispositivos, guion). Reutiliza las sesiones
// reales, el cuerpo y el punto de partida de «Muñeca · fuerza» (I1: el iPhone
// pinta EL MISMO estado). Lo que la muñeca no tenía se construye aquí con
// sus mismos constructores y se dice de dónde sale:
//   · la pirámide: bloque 392 «Fuerza inferior PESADA», Back Squat 6-6-4-4-3
//     @75–85 % RM (el caso que rompió el modelo de julio), r 2′30″ (ilustrativo);
//   · las series rectas con RIR: el ejemplo literal del modelo (P11), «5 × 100
//     kg · RIR 2 · 3-1-1», contado por ti (sin sensor, como en un móvil);
//   · el LIBRE: un entreno que escribe el atleta con dos ejercicios de la
//     biblioteca y carga suya. Nada en el vivo sabe que no es del coach.

import type { Dispositivos, GestoIphone } from '../../kit-iphone-vivo';
import { esFuerza, type Campo, type InicioSecuencia, type PasoBase, type PlanSesion, type Registro, type Simulador } from '../../kit-reloj';
import { casoDe as casoMuneca, cuerpo, inicioEn } from '../reloj-fuerza/casos';
import { ejemploP11, ejercicio, indiceDe, plan, rm, serie, sesion529, sesion538, tuya, type DefEjercicio } from '../reloj-fuerza/planes';

/** Un gesto de la anotación (lo que no es de la carcasa): mover un dato de una serie del descanso, o confirmar. */
export type AccionAnotar = { tipo: 'mover'; serie: number; campo: Campo; dir: 1 | -1 } | { tipo: 'confirmar' };

export interface CasoFuerzaIphone {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  registro: Registro;
  dispositivos: Dispositivos;
  /** Gestos de la carcasa (la primaria, pausa, deshacer…). */
  guion?: Array<{ en: number; gesto: GestoIphone }>;
  /** Gestos de la anotación. */
  acciones?: Array<{ en: number; accion: AccionAnotar }>;
}

/** El móvil lleva el motor; el pulso, de una banda. */
const MOVIL: Dispositivos = { reloj: 'sin', maquina: null, pulsometro: 'banda' };

/** RM de sentadilla del atleta (la de las otras propuestas): 186,5 kg. */
const RM_SENTADILLA = 186.5;

// ---------------------------------------------------------------------------
// Planes que la muñeca no tenía
// ---------------------------------------------------------------------------

/**
 * Bloque 392 · «Fuerza inferior PESADA»: Back Squat 6 · 6 · 4 · 4 · 3 @75–85 %
 * RM. Cada serie tiene SU medida y la carga es una banda: el atleta sube dentro
 * de ella y lo que declara pasa en cascada a la siguiente (misma prescripción).
 * El descanso de 2′30″ es ilustrativo (el bloque no lo escribe).
 */
export function planPiramide392(): PlanSesion {
  const reps = [6, 6, 4, 4, 3];
  const def: DefEjercicio = { clave: '392-bs', nombre: 'Back Squat', series: reps.length, carga: rm(75, 85, RM_SENTADILLA) };
  const pasos: PasoBase[] = [];
  reps.forEach((r, k) => {
    const s = serie({ ...def, reps: r }, k + 1, 0);
    pasos.push({ ...s, id: `392-bs-s${k + 1}` });
    if (k < reps.length - 1) pasos.push({ id: `392-descanso-${k + 1}`, clase: 'descanso', rol: 'descanso', fase: 'principal', medida: { tipo: 'tiempo', prescrito: 150, mide: 'reloj' }, objetivos: [], cierre: 'medida', bloque: 0 });
  });
  return plan(pasos);
}

/** El ejemplo literal del modelo (P11), contado por ti: sin sensor, la serie la cierras tú. */
export function planP11ContadoPorTi(): PlanSesion {
  const p = ejemploP11();
  return { ...p, pasos: p.pasos.map((q) => (esFuerza(q) && q.medida.mide === 'sensor' ? { ...q, medida: { ...q.medida, mide: 'atleta' as const } } : q)) };
}

/** Un entreno LIBRE: Back Squat 4 × 10 (última vez 80 kg) r 90″ · Press militar 3 × 8 r 90″. Carga tuya, sin esfuerzo prescrito. */
export function planLibre(): PlanSesion {
  const bs: DefEjercicio = { clave: 'libre-bs', nombre: 'Back Squat', series: 4, reps: 10, carga: tuya(80) };
  const pm: DefEjercicio = { clave: 'libre-pm', nombre: 'Press militar', series: 3, reps: 8, carga: tuya() };
  return plan([...ejercicio(bs, 90, 0), ...ejercicio(pm, 90, 0).slice(0, -1)]);
}

// ---------------------------------------------------------------------------
// Los escenarios
// ---------------------------------------------------------------------------

const reps = (n: number, kg?: number, esfuerzo?: number) => ({ reps: n, ...(kg != null ? { kg } : {}), ...(esfuerzo != null ? { esfuerzo } : {}) });

export function casoDe(escenario: string): CasoFuerzaIphone {
  switch (escenario) {
    case 'rectas': {
      // P11, serie 3/5 con las dos primeras declaradas. A los 3 s «Serie
      // hecha»; en el descanso se toca el RIR y baja a 1; a los 8 s Confirmar.
      const p = planP11ContadoPorTi();
      return {
        plan: p,
        sim: cuerpo,
        inicio: inicioEn(p, indiceDe(p, 'p11-bs-s3'), 9),
        registro: { 'p11-bs-s1': reps(5, 100, 2), 'p11-bs-s2': reps(5, 100, 2) },
        dispositivos: MOVIL,
        guion: [{ en: 3000, gesto: 'primaria' }],
        acciones: [
          { en: 5500, accion: { tipo: 'mover', serie: 0, campo: 'esfuerzo', dir: -1 } },
          { en: 8000, accion: { tipo: 'confirmar' } },
        ],
      };
    }
    case 'piramide': {
      // 392, serie 2/5 (6 reps) con la 1 declarada a 140 kg. «Serie hecha» a
      // los 2,5 s; la carga sube dos clics (145) y «Viene:» lo enseña en la
      // serie 3; Confirmar a los 9 s.
      const p = planPiramide392();
      return {
        plan: p,
        sim: cuerpo,
        inicio: inicioEn(p, indiceDe(p, '392-bs-s2'), 7),
        registro: { '392-bs-s1': reps(6, 140) },
        dispositivos: MOVIL,
        guion: [{ en: 2500, gesto: 'primaria' }],
        acciones: [
          { en: 5000, accion: { tipo: 'mover', serie: 0, campo: 'kg', dir: 1 } },
          { en: 6000, accion: { tipo: 'mover', serie: 0, campo: 'kg', dir: 1 } },
          { en: 9000, accion: { tipo: 'confirmar' } },
        ],
      };
    }
    case 'anotar': {
      // 529, el descanso tras A2 (ronda 1): propuesto → declarado → confirmado.
      const c = casoMuneca('ronda');
      return {
        plan: c.plan,
        sim: c.sim,
        inicio: c.inicio,
        registro: c.registro,
        dispositivos: MOVIL,
        acciones: [
          { en: 2500, accion: { tipo: 'mover', serie: 0, campo: 'kg', dir: 1 } },
          { en: 3600, accion: { tipo: 'mover', serie: 0, campo: 'kg', dir: 1 } },
          { en: 6000, accion: { tipo: 'confirmar' } },
        ],
      };
    }
    case 'ultima': {
      // 529, A2 serie 4/4: la última del bloque A. Serie hecha a los 2 s →
      // el descanso anota la ronda 4 y anuncia B1; Confirmar a los 9 s;
      // Empezar ya a los 12,5 s → B1 Deadlift serie 1/4.
      const c = casoMuneca('ultima');
      return {
        plan: c.plan,
        sim: c.sim,
        inicio: c.inicio,
        registro: c.registro,
        dispositivos: MOVIL,
        guion: [
          { en: 2000, gesto: 'primaria' },
          { en: 9000, gesto: 'primaria' },
          { en: 12500, gesto: 'primaria' },
        ],
      };
    }
    case 'plancha': {
      // 538, Side Plank 3 × 20″, serie 2/3 a los 6 s: se cierra sola; luego
      // «Colócate» 5 s con su 3-2-1 y la serie 3.
      const p = sesion538();
      return { plan: p, sim: cuerpo, inicio: inicioEn(p, indiceDe(p, '538-sp-s2'), 6), registro: {}, dispositivos: MOVIL };
    }
    case 'libre': {
      // Back Squat 4 × 10, serie 2/4, la 1 declarada a 80 kg.
      const p = planLibre();
      return { plan: p, sim: cuerpo, inicio: inicioEn(p, indiceDe(p, 'libre-bs-s2'), 5), registro: { 'libre-bs-s1': reps(10, 80) }, dispositivos: MOVIL };
    }
    case 'superserie':
    default: {
      // 529, A1 serie 1/4; a los 4,2 s «Serie hecha» y A2 entra sin descanso.
      const c = casoMuneca('superserie');
      const p = sesion529();
      return { plan: p, sim: c.sim, inicio: inicioEn(p, indiceDe(p, '529-A1-s1'), 6), registro: {}, dispositivos: MOVIL, guion: [{ en: 4200, gesto: 'primaria' }] };
    }
  }
}
