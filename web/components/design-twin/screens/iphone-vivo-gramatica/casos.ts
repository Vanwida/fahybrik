// LOS CASOS — cada escenario de «iPhone · la gramática» como (plan, cuerpo,
// punto de partida, dispositivos, guion). Reutiliza las sesiones reales y los
// simuladores de las propuestas de la muñeca (`screens/reloj-*/casos.ts`):
// el iPhone pinta EL MISMO estado (I1), así que los casos son los mismos.
// Lo que no existía en la muñeca (la BikeErg a /1000, el test de remo de 2
// km, la máquina que reporta cadencia, vatios y calorías) se añade aquí y se
// dice que es ilustrativo.

import type { Dispositivos, GestoIphone } from '../../kit-iphone-vivo';
import {
  REGLAS_AVISO_DEFECTO,
  type Estimador,
  type EstadoSecuencia,
  type InicioSecuencia,
  type LecturaSim,
  type Objetivo,
  type PasoBase,
  type PlanSesion,
  type Registro,
  type Simulador,
  type ZonasCoach,
} from '../../kit-reloj';
import { casoDe as casoCircuito } from '../reloj-circuito/casos';
import { dibujoDe } from '../reloj-circuito/planes';
import { totalDe } from '../reloj-circuito/vista';
import { casoDe as casoCorrer } from '../reloj-correr/casos';
import { casoDe as casoFuerza } from '../reloj-fuerza/casos';
import { casoDe as casoWod } from '../reloj-wod/casos';

/** Umbral 170 ppm, 5 zonas del coach (las mismas de las propuestas de la muñeca). */
export const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };

export interface CasoIphone {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  dispositivos: Dispositivos;
  duracion?: Estimador;
  cronoTotal?: (e: EstadoSecuencia) => number | null;
  guion?: Array<{ en: number; gesto: GestoIphone }>;
  /** Fuerza: lo ya declarado. */
  registro?: Registro;
  /** AMRAP: las rondas contadas al arrancar. */
  rondas?: number;
}

/** El móvil lleva el motor; el pulso, de una banda. */
const MOVIL: Dispositivos = { reloj: 'sin', maquina: null, pulsometro: 'banda' };

const ruido = (t: number, a: number) => Math.sin(t * 1.3) * a * 0.6 + Math.sin(t * 0.37 + 1) * a * 0.4;

/**
 * La máquina reporta lo suyo: paladas o pedaladas por minuto, vatios y
 * calorías. Concept2 da los vatios del /500 (2,8 / (s/m)³) y ~1000 kcal/h a
 * 180 W; aquí, lo justo para que la rejilla enseñe lo que la máquina manda.
 */
function conMaquina(sim: Simulador, cadencia: number, tipo: 'remo' | 'ski' | 'bici' = 'ski'): Simulador {
  return (p, i, t, sesionT) => {
    const l: LecturaSim = sim(p, i, t, sesionT);
    if (l.split500 == null || p.rol !== 'trabajo') return l;
    const paceM = l.split500 / 500;
    const vatios = tipo === 'bici' ? Math.round(250 + ruido(t, 8)) : Math.round(2.8 / (paceM * paceM * paceM));
    return { ...l, cadencia: Math.round(cadencia + ruido(t, 1.5)), vatios, cal: Math.round(t * ((vatios * 4 + 300) / 3600)) };
  };
}

// ---------------------------------------------------------------------------
// Planes que la muñeca no tenía (ilustrativos)
// ---------------------------------------------------------------------------

let n = 0;
const id = (p: string) => `${p}-${++n}`;
const plan = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

/** BikeErg 3 × 4′ a 2:00/1000 (60 s/500 en el dato) · r 2′ parado. Ilustrativo: no hay ninguna asignada. */
export function planBici(): PlanSesion {
  const split: Objetivo = { eje: 'split500', min: 60, max: 60, papel: 'principal' };
  const pasos: PasoBase[] = [];
  for (let k = 1; k <= 3; k++) {
    pasos.push({ id: id('bici'), clase: 'ergo', rol: 'trabajo', fase: 'principal', nombre: 'BikeErg', maquina: { tipo: 'bici' }, medida: { tipo: 'tiempo', prescrito: 240, mide: 'ergo' }, objetivos: [split], posicion: { serie: { n: k, de: 3 } }, cierre: 'medida', bloque: 0 });
    if (k < 3) pasos.push({ id: id('rec'), clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: { tipo: 'tiempo', prescrito: 120, mide: 'reloj' }, objetivos: [], modoRecupera: 'parado', cierre: 'medida', bloque: 0 });
  }
  return plan(pasos);
}

/** Test de remo 2000 m: sin objetivo (es un test), lo mide la máquina. */
export function planTestRemo(): PlanSesion {
  return plan([
    { id: id('test'), clase: 'test', rol: 'trabajo', fase: 'principal', maquina: { tipo: 'remo' }, medida: { tipo: 'distancia', prescrito: 2000, mide: 'ergo' }, objetivos: [], cierre: 'medida', bloque: 0 },
  ]);
}

// ---------------------------------------------------------------------------
// Los escenarios
// ---------------------------------------------------------------------------

export function casoDe(escenario: string): CasoIphone {
  switch (escenario) {
    case 'ergo':
    case 'horizontal': {
      const c = casoWod('ergo-505');
      return { plan: c.datos.plan, sim: conMaquina(c.sim, 42), inicio: c.inicio, dispositivos: { ...MOVIL, maquina: 'ski' } };
    }
    case 'bici': {
      const p = planBici();
      const sim: Simulador = (q, _i, t) =>
        q.rol === 'trabajo'
          ? { ritmo: null, split500: Math.round(2 * (61 + ruido(t, 1.2))) / 2, ppm: Math.round(158 + ruido(t + 3, 1)), gps: 'no-aplica' }
          : { ritmo: null, ppm: Math.round(126 + 30 * Math.exp(-t / 30)), ppmTendencia: 'baja', gps: 'no-aplica' };
      return { plan: p, sim: conMaquina(sim, 88, 'bici'), inicio: { i: 2, t: 96, sesionT: 456, sesionErgoM: 2760, ppmMedio: 150, metros: 780 }, dispositivos: { ...MOVIL, maquina: 'bici' } };
    }
    case 'maquina-perdida': {
      const c = casoWod('ergo-505');
      const base = conMaquina(c.sim, 42);
      // A los 3 s de escenario el monitor deja de llegar: lo suyo se marca viejo.
      const sim: Simulador = (p, i, t, s) => ({ ...base(p, i, t, s), viejos: t >= (c.inicio.t ?? 0) + 3 ? ['split500', 'hecho', 'vatios', 'cadencia', 'cal'] : undefined });
      return { plan: c.datos.plan, sim, inicio: c.inicio, dispositivos: { ...MOVIL, maquina: 'ski' } };
    }
    case 'sin-maquina': {
      const c = casoWod('ergo-sin-pm5');
      return { plan: c.datos.plan, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL };
    }
    case 'test': {
      const p = planTestRemo();
      const sim: Simulador = (_q, _i, t) => ({ ritmo: null, split500: Math.round(2 * (112 + ruido(t, 1))) / 2, ppm: Math.round(Math.min(186, 150 + t * 0.25) + ruido(t, 1)), gps: 'no-aplica' });
      return { plan: p, sim: conMaquina(sim, 30, 'remo'), inicio: { i: 0, t: 291, metros: 1300, sesionT: 291, sesionErgoM: 1300, ppmMedio: 172 }, dispositivos: { ...MOVIL, maquina: 'remo' } };
    }
    case 'fuerza': {
      const c = casoFuerza('superserie');
      return { plan: c.plan, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, registro: c.registro, guion: [{ en: 4200, gesto: 'primaria' }] };
    }
    case 'anotar': {
      const c = casoFuerza('ronda');
      return { plan: c.plan, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, registro: c.registro };
    }
    case 'deshacer': {
      const c = casoFuerza('deshacer');
      return {
        plan: c.plan,
        sim: c.sim,
        inicio: c.inicio,
        dispositivos: MOVIL,
        registro: c.registro,
        guion: [
          { en: 1500, gesto: 'primaria' },
          { en: 4000, gesto: 'deshacer' },
        ],
      };
    }
    case 'emom': {
      const c = casoWod('emom-alterno');
      return { plan: c.datos.plan, sim: c.sim, inicio: c.inicio, dispositivos: { ...MOVIL, maquina: 'remo' }, guion: [{ en: 3500, gesto: 'primaria' }] };
    }
    case 'amrap': {
      const c = casoWod('amrap-15');
      return { plan: c.datos.plan, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, rondas: 4, guion: [{ en: 3000, gesto: 'primaria' }] };
    }
    case 'fortime': {
      const c = casoWod('fortime');
      return { plan: c.datos.plan, sim: conMaquina(c.sim, 30, 'remo'), inicio: c.inicio, dispositivos: { ...MOVIL, maquina: 'remo' }, cronoTotal: (e) => e.sesionT };
    }
    case 'tabata': {
      const c = casoWod('tabata');
      return { plan: c.datos.plan, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL };
    }
    case 'circuito': {
      const c = casoCircuito('hyrox-sled');
      return { plan: c.c.plan, sim: c.sim, inicio: c.inicio, dispositivos: { ...MOVIL, maquina: 'ski' }, duracion: dibujoDe, cronoTotal: (e) => totalDe(e, c.c), guion: [{ en: 3500, gesto: 'primaria' }] };
    }
    case 'circuito-carrera': {
      const c = casoCircuito('hyrox-carrera');
      return { plan: c.c.plan, sim: c.sim, inicio: c.inicio, dispositivos: { ...MOVIL, maquina: 'ski' }, duracion: dibujoDe, cronoTotal: (e) => totalDe(e, c.c) };
    }
    case 'descanso': {
      const c = casoCircuito('c493-descanso');
      return { plan: c.c.plan, sim: c.sim, inicio: c.inicio, dispositivos: { ...MOVIL, maquina: 'ski' }, duracion: dibujoDe, cronoTotal: (e) => totalDe(e, c.c) };
    }
    case 'pausa': {
      const c = casoCorrer('serie-dentro');
      return { plan: c.datos.plan, sim: c.sim, inicio: { ...c.inicio, pausado: true }, dispositivos: MOVIL, guion: [{ en: 4000, gesto: 'reanudar' }] };
    }
    case 'reloj': {
      const c = casoCorrer('serie-dentro');
      return { plan: c.datos.plan, sim: c.sim, inicio: c.inicio, dispositivos: { reloj: 'motor', maquina: null, pulsometro: 'reloj' } };
    }
    case 'terminar': {
      const c = casoCorrer('serie-dentro');
      return {
        plan: c.datos.plan,
        sim: c.sim,
        inicio: c.inicio,
        dispositivos: MOVIL,
        guion: [
          { en: 2000, gesto: 'terminar' },
          { en: 6500, gesto: 'terminar-guardar' },
        ],
      };
    }
    case 'gps': {
      const c = casoCorrer('gps');
      return { plan: c.datos.plan, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL };
    }
    case 'estructura': {
      const c = casoCorrer('serie-dentro');
      return { plan: c.datos.plan, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL, guion: [{ en: 1500, gesto: 'estructura' }] };
    }
    case 'correr':
    case 'bloqueo':
    case 'isla':
    default: {
      const c = casoCorrer('serie-dentro');
      return { plan: c.datos.plan, sim: c.sim, inicio: c.inicio, dispositivos: MOVIL };
    }
  }
}
