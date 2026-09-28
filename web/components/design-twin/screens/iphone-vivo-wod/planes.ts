// LOS PLANES DEL WOD QUE LA MUÑECA NO TENÍA — escritos como pasos del kit,
// sin texto libre. Los que sí tenía (498 EMOM alterno, el Tabata) se
// reutilizan de `screens/reloj-wod/planes.ts`: el iPhone pinta EL MISMO
// estado (I1). Lo que no sale de una sesión real se dice aquí:
//   · El AMRAP con remo, el chipper For Time con cap y el death by son
//     ilustrativos: no hay ninguno asignado (lente 6 de la auditoría).
//   · El AMRAP libre es el mismo objeto que uno del coach: nada en el vivo
//     sabe de dónde vino el entreno. Se enseña para verlo igual.

import {
  REGLAS_AVISO_DEFECTO,
  minutosDeathBy,
  type Medida,
  type PasoBase,
  type PlanSesion,
  type QuienMide,
  type Tarea,
} from '../../kit-reloj';
import { ZONAS, amrap } from '../reloj-wod/planes';

let cuenta = 0;
const id = (p: string) => `wod-${p}-${++cuenta}`;
const base = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

const reps = (n: number): Medida => ({ tipo: 'reps', prescrito: n, mide: 'atleta' });
const metros = (m: number, mide: QuienMide): Medida => ({ tipo: 'distancia', prescrito: m, mide });
const cal = (n: number): Medida => ({ tipo: 'cal', prescrito: n, mide: 'ergo' });

// ---------------------------------------------------------------------------
// AMRAP con remo (ilustrativo) y el AMRAP libre
// ---------------------------------------------------------------------------

/** AMRAP 12′: 250 m Row (lo mide el remo) · 15 Wall Ball 9 kg · 10 Burpee. 26 «reps» por ronda (el Row cuenta 1). */
export function amrapRemo(): PlanSesion {
  const tareas: Tarea[] = [
    { nombre: 'Row', dosis: metros(250, 'ergo'), mide: 'ergo' },
    { nombre: 'Wall Ball', dosis: reps(15), carga: { kg: 9 }, mide: 'atleta' },
    { nombre: 'Burpee', dosis: reps(10), corporal: true, mide: 'atleta' },
  ];
  return base(amrap(tareas, 720, { maquina: { tipo: 'remo' } }));
}

/** AMRAP 20′ LIBRE, sin coach (5 Pull-up · 10 Push-up · 15 Air Squat): el mismo objeto que uno asignado. */
export function amrapLibre(): PlanSesion {
  const tareas: Tarea[] = [
    { nombre: 'Pull-up', dosis: reps(5), corporal: true, mide: 'atleta' },
    { nombre: 'Push-up', dosis: reps(10), corporal: true, mide: 'atleta' },
    { nombre: 'Air Squat', dosis: reps(15), corporal: true, mide: 'atleta' },
  ];
  return base(amrap(tareas, 1200));
}

// ---------------------------------------------------------------------------
// For Time · chipper con cap (ilustrativo)
// ---------------------------------------------------------------------------

/** Diez estaciones seguidas, una ronda, cap 25′. El Row por calorías lo mide el remo; la carrera, el GPS; el resto lo dices tú. */
export function chipperForTime(): PlanSesion {
  const cap = 1500;
  const tareas: Tarea[] = [
    { nombre: 'Double Under', dosis: reps(50), corporal: true, mide: 'atleta' },
    { nombre: 'Wall Ball', dosis: reps(40), carga: { kg: 9 }, mide: 'atleta' },
    { nombre: 'Row', dosis: cal(30), mide: 'ergo' },
    { nombre: 'Burpee', dosis: reps(20), corporal: true, mide: 'atleta' },
    { nombre: 'KB Swing', dosis: reps(30), carga: { kg: 24 }, mide: 'atleta' },
    { nombre: 'Box Jump', dosis: reps(20), corporal: true, mide: 'atleta' },
    { nombre: 'Toes to Bar', dosis: reps(20), corporal: true, mide: 'atleta' },
    { nombre: 'Sandbag Lunge', dosis: metros(50, 'atleta'), carga: { kg: 20 }, mide: 'atleta' },
    { nombre: 'Farmers Carry', dosis: metros(100, 'atleta'), carga: { kg: 24, implementos: 2 }, mide: 'atleta' },
  ];
  const pasos: PasoBase[] = tareas.map((t, k) => ({
    id: id('chipper'),
    clase: 'fortime',
    rol: 'trabajo',
    fase: 'principal',
    nombre: t.nombre,
    carga: t.carga,
    maquina: t.nombre === 'Row' ? { tipo: 'remo' } : undefined,
    medida: t.dosis!,
    objetivos: [],
    cierre: t.mide === 'atleta' ? 'atleta' : 'medida',
    posicion: { estacion: { n: k + 1, de: tareas.length + 1 } },
    bloque: 0,
    wod: { formato: 'fortime', tarea: t, capS: cap },
  }));
  // La carrera del final es un paso de correr (P10): usa la cara de correr con el total en la cabecera.
  pasos.push({
    id: id('run'),
    clase: 'carrera',
    rol: 'trabajo',
    fase: 'principal',
    nombre: 'Run',
    medida: metros(800, 'gps'),
    objetivos: [],
    cierre: 'medida',
    posicion: { estacion: { n: tareas.length + 1, de: tareas.length + 1 } },
    bloque: 0,
    wod: { formato: 'fortime', tarea: null, capS: cap },
  });
  return base(pasos);
}

// ---------------------------------------------------------------------------
// Death by (ilustrativo)
// ---------------------------------------------------------------------------

/** Death by Burpee: 1 el minuto 1, +1 cada minuto, hasta que el reloj te cace. Sin tope del coach. */
export function deathByBurpee(): PlanSesion {
  const burpee: Tarea = { nombre: 'Burpee', dosis: reps(1), corporal: true, mide: 'atleta' };
  return base(minutosDeathBy(burpee, { inicio: 1, incremento: 1, ventanaS: 60, tope: null }, () => id('deathby')));
}
