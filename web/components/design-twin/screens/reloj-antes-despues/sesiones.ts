// LAS SESIONES DE ANTES Y DESPUÉS — las reales, escritas como pasos del kit.
//
// Las de correr (6 × 1000 m del modelo, 479, 491, 494 y la cinta 535) son las
// MISMAS que pinta «Muñeca · correr» (`reloj-correr/planes.ts`): una sesión se
// lee igual en la esfera, en el brief y en la página Estructura del vivo. Aquí
// solo se les pone el entorno (M3) cuando la prescripción lo trae.
//
// 529 (fuerza), 493 y 482 (carrera comprometida) salen de la lente 6 de la
// auditoría (get_plan / get_session de los atletas 63–65). Sin texto libre
// salvo el cue del coach (M8) y el nombre de catálogo.

import {
  REGLAS_AVISO_DEFECTO,
  type Entorno,
  type Medida,
  type Objetivo,
  type PasoBase,
  type PlanSesion,
} from '../../kit-reloj';
import { ZONAS, seisPorMil, sesion479, sesion491, sesion494, sesion535 } from '../reloj-correr/planes';

export { ZONAS };

let seq = 0;
const id = (p: string) => `ad-${p}-${++seq}`;

type Parcial = Omit<PasoBase, 'id' | 'cierre' | 'objetivos'> & { objetivos?: Objetivo[]; cierre?: PasoBase['cierre'] };
const paso = (p: Parcial): PasoBase => ({ id: id(p.clase), cierre: 'medida', objetivos: [], ...p });

const porTiempo = (s: number): Medida => ({ tipo: 'tiempo', prescrito: s, mide: 'reloj' });
const reps = (n: number): Medida => ({ tipo: 'reps', prescrito: n, mide: 'atleta' });
const metros = (m: number, mide: Medida['mide']): Medida => ({ tipo: 'distancia', prescrito: m, mide });
const abierta = (mide: Medida['mide']): Medida => ({ tipo: 'abierta', prescrito: null, mide });

const plan = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

/** Pone el entorno de la prescripción (M3) a los pasos de correr. */
export const conEntorno = (p: PlanSesion, entorno: Entorno): PlanSesion => ({
  ...p,
  pasos: p.pasos.map((x) => (x.clase === 'movilidad' || x.rol === 'descanso' ? x : { ...x, entorno })),
});

/** Qué tipo de sesión es: decide si hay GPS que esperar y qué resumen se pinta. */
export type Familia = 'correr' | 'fuerza' | 'circuito' | 'libre';

export interface Sesion {
  id: string;
  plan: PlanSesion;
  familia: Familia;
  /** El entorno de la prescripción; `null` en una sesión de correr que no lo dice (se pregunta al empezar). */
  entorno: Entorno | null;
}

// ---------------------------------------------------------------------------
// Correr — las de «Muñeca · correr», con su entorno
// ---------------------------------------------------------------------------

/** El caso ilustrativo del modelo: 6 × 1000 m @3:45–3:55 · r 90″ trote, en la calle. */
export function sesionSeisPorMil(): Sesion {
  return { id: '6x1000', plan: conEntorno(seisPorMil().plan, 'calle'), familia: 'correr', entorno: 'calle' };
}

/** 479 · Run 5′ Z2 · 6 × (800 m @Z5 / 2′30″ trote) · WB 5 × 12 @9 kg r 1′ · Run 3′ Z1. La prescripción no dice dónde. */
export function sesion479Brief(): Sesion {
  return { id: '479', plan: sesion479().plan, familia: 'correr', entorno: null };
}

/** 491 · Run 50′ @Z2 · Movilidad 15′. Sin entorno: se pregunta al empezar. */
export function sesion491Brief(): Sesion {
  return { id: '491', plan: sesion491().plan, familia: 'correr', entorno: null };
}

/** 494 · Run 80′ @Z2, «mirar el pulso», en la calle. */
export function sesion494Brief(): Sesion {
  return { id: '494', plan: conEntorno(sesion494().plan, 'calle'), familia: 'correr', entorno: 'calle' };
}

/** 535 · cinta al 1 %: la prescripción ya lo dice, no hay GPS que esperar. */
export function sesion535Brief(): Sesion {
  return { id: '535', plan: sesion535().plan, familia: 'correr', entorno: 'cinta' };
}

// ---------------------------------------------------------------------------
// 529 · A Back Squat 4 × 8 @65–70 % RM (121–131 kg) + Box Jump 4 × 6 r 2′ ·
//       B Deadlift 4 × 8 @RIR 3 + Bulgarian Split Squat 4 × 6 r 2′ ·
//       Sled Push 6 × 15 m r 90″ «carga media»
// ---------------------------------------------------------------------------

export function sesion529(): Sesion {
  const pasos: PasoBase[] = [];
  const pct: Objetivo = { eje: 'pctRM', min: 65, max: 70, papel: 'principal' };
  const kg: Objetivo = { eje: 'kg', min: 121, max: 131, papel: 'secundario' };
  const rir: Objetivo = { eje: 'rir', min: 3, max: 3, papel: 'principal' };
  const descanso = (s: number, bloque: number) => paso({ clase: 'descanso', rol: 'descanso', fase: 'principal', medida: porTiempo(s), bloque });
  for (let k = 1; k <= 4; k++) {
    pasos.push(
      paso({ clase: 'fuerza', rol: 'trabajo', fase: 'principal', nombre: 'Back Squat', medida: reps(8), objetivos: [pct, kg], posicion: { serie: { n: k, de: 4 }, slot: 'A1' }, cierre: 'atleta', bloque: 0 }),
      paso({ clase: 'fuerza', rol: 'trabajo', fase: 'principal', nombre: 'Box Jump', medida: reps(6), posicion: { serie: { n: k, de: 4 }, slot: 'A2' }, cierre: 'atleta', bloque: 0 }),
      descanso(120, 0),
    );
  }
  for (let k = 1; k <= 4; k++) {
    pasos.push(
      paso({ clase: 'fuerza', rol: 'trabajo', fase: 'principal', nombre: 'Deadlift', medida: reps(8), objetivos: [rir], posicion: { serie: { n: k, de: 4 }, slot: 'B1' }, cierre: 'atleta', bloque: 1 }),
      paso({ clase: 'fuerza', rol: 'trabajo', fase: 'principal', nombre: 'Bulgarian Split Squat', medida: reps(6), posicion: { serie: { n: k, de: 4 }, slot: 'B2' }, cierre: 'atleta', bloque: 1 }),
      descanso(120, 1),
    );
  }
  for (let k = 1; k <= 6; k++) {
    pasos.push(
      paso({ clase: 'estacion', rol: 'trabajo', fase: 'principal', nombre: 'Sled Push', medida: metros(15, 'atleta'), posicion: { serie: { n: k, de: 6 } }, cue: 'carga media', cierre: 'atleta', bloque: 2 }),
    );
    if (k < 6) pasos.push(descanso(90, 2));
  }
  return { id: '529', plan: plan(pasos), familia: 'fuerza', entorno: null };
}

// ---------------------------------------------------------------------------
// 493 / 482 · Run 6′ Z2 · N rondas: Run 1000 m @RPE 8 + una estación, r 90″
// (SkiErg 500 m · Burpee Broad Jump 40 m · Rowing 500 m · Wall Ball 25 @9 kg ·
//  Sandbag Lunges 50 m @30 kg). En 493 el coach activa la Roxzone como paso.
// ---------------------------------------------------------------------------

const ESTACIONES: Array<Pick<PasoBase, 'nombre' | 'medida' | 'carga' | 'maquina'>> = [
  { nombre: 'SkiErg', medida: metros(500, 'ergo'), maquina: { tipo: 'ski' } },
  { nombre: 'Burpee Broad Jump', medida: metros(40, 'atleta') },
  { nombre: 'Rowing', medida: metros(500, 'ergo'), maquina: { tipo: 'remo' } },
  { nombre: 'Wall Ball', medida: reps(25), carga: { kg: 9 } },
  { nombre: 'Sandbag Lunges', medida: metros(50, 'atleta'), carga: { kg: 30 } },
];

function circuito(rondas: number, roxzone: boolean, idSesion: string): Sesion {
  const rpe8: Objetivo = { eje: 'rpe', min: 8, max: 8, papel: 'principal' };
  const pasos: PasoBase[] = [
    paso({ clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', medida: porTiempo(360), objetivos: [{ eje: 'zona', min: 2, max: 2, papel: 'principal', avisa: 'solo-arriba' }], bloque: 0 }),
  ];
  for (let r = 1; r <= rondas; r++) {
    const ronda = { n: r, de: rondas };
    pasos.push(paso({ clase: 'carrera', rol: 'trabajo', fase: 'principal', medida: metros(1000, 'gps'), objetivos: [rpe8], posicion: { ronda }, bloque: 1 }));
    if (roxzone) pasos.push(paso({ clase: 'roxzone', rol: 'transicion', fase: 'principal', medida: abierta('atleta'), posicion: { ronda }, cierre: 'atleta', bloque: 1 }));
    pasos.push(paso({ clase: 'estacion', rol: 'trabajo', fase: 'principal', ...ESTACIONES[r - 1]!, posicion: { ronda }, cierre: 'atleta', bloque: 1 }));
    if (r < rondas) pasos.push(paso({ clase: 'descanso', rol: 'descanso', fase: 'principal', medida: porTiempo(90), bloque: 1 }));
  }
  return { id: idSesion, plan: plan(pasos), familia: 'circuito', entorno: 'calle' };
}

export const sesion493 = () => circuito(5, true, '493');
export const sesion482 = () => circuito(4, false, '482');

// ---------------------------------------------------------------------------
// Libres — hoy no se puede empezar ninguna (P1-18)
// ---------------------------------------------------------------------------

/** Correr libre: un paso abierto, vuelta automática por km (dato del coach, P9), sin objetivo. Sin entorno aún: se pregunta. */
export function correrLibre(entorno: Entorno | null): Sesion {
  const p = paso({ clase: 'rodaje', rol: 'trabajo', fase: 'principal', medida: abierta(entorno === 'cinta' ? 'cinta' : 'gps'), entorno: entorno ?? undefined, cierre: 'atleta', vueltaAutoM: 1000, bloque: 0 });
  return { id: 'libre', plan: plan([p]), familia: 'libre', entorno };
}

/** Tras «Seguir» en el final natural: un enfriamiento abierto que sigue grabando en la misma sesión. */
export function enfriamientoLibre(entorno: Entorno | null): PlanSesion {
  return plan([
    paso({ clase: 'vuelta-calma', rol: 'trabajo', fase: 'vuelta', medida: abierta(entorno === 'cinta' ? 'cinta' : 'gps'), entorno: entorno ?? undefined, cierre: 'atleta', vueltaAutoM: 1000, bloque: 9 }),
  ]);
}
