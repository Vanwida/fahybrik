// LOS PLANES DE FUERZA — las sesiones reales escritas como pasos del kit con
// su ficha de fuerza, sin texto libre salvo el cue del coach (M8).
//
// Fuente: get_session del atleta 64 (Alex), 25-09-2026:
//   529 · «Fuerza tren inferior + sled técnico» (3-sep)
//   488 · «Fuerza A + SkiErg» (17-ago)
//   492 · «Fuerza B + Trineos» (27-ago)
//   538 · «Glúteo + 4x600 / 3x800» (6-sep), su superserie de core
// y el ejemplo literal del modelo (P11): «5 × 100 kg · RIR 2 · 3-1-1».
//
// Lo que la sesión trae como NOTA y aquí es dato: «@72% 1RM» (488) y «@78%
// 1RM» (492) → carga en %RM; «10 por pierna» (488) → `porLado`;
// «Concéntrica explosiva» (529) → el cue; «Lastrado» (488) → carga tuya con
// lastre. Lo que NO trae la sesión y hace falta para dibujar se dice aquí:
//   · RM de sentadilla 186,5 kg: la que resuelve 65–70 % en los 121–131 kg
//     que enseña la propia 529.
//   · RM de peso muerto 200 kg, última carga de peso muerto 140 kg y las dos
//     series de aproximación de 488: ILUSTRATIVAS (ninguna sesión las da).

import { REGLAS_AVISO_DEFECTO, type Objetivo, type PasoBase, type PlanSesion, type ZonasCoach } from '../../kit-reloj';
import type { CargaFuerza, EsfuerzoFuerza, FichaFuerza, PasoFuerza } from './modelo';

/** Zonas del atleta 64 con las bandas del coach (umbral 170): las de las otras propuestas de la muñeca. */
export const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };

/** Segundos para colocarse antes de una isometría que no viene de un descanso. Método: dato con defecto. */
export const COLOCATE_S_DEFECTO = 5;

/** Barra y discos: 2,5 kg por clic. Mancuernas: 2 kg. Dato del gimnasio. */
const BARRA = 2.5;
const MANCUERNA = 2;

const RM_SENTADILLA = 186.5;
const RM_PESO_MUERTO = 200;

// ---------------------------------------------------------------------------
// Constructores
// ---------------------------------------------------------------------------

interface DefEjercicio {
  clave: string;
  nombre: string;
  slot?: string;
  series: number;
  /** Reps por serie, o `segundos` si es una isometría. */
  reps?: number;
  segundos?: number;
  carga: CargaFuerza;
  esfuerzo?: EsfuerzoFuerza;
  porLado?: FichaFuerza['porLado'];
  tempo?: PasoBase['tempo'];
  cue?: string;
  mide?: 'atleta' | 'sensor';
  pasoKg?: number;
  aproximaciones?: Array<{ reps: number; kg: number }>;
}

const rm = (pctMin: number, pctMax: number, rmKg: number): CargaFuerza => ({ tipo: 'rm', pctMin, pctMax, rmKg });
const corporal: CargaFuerza = { tipo: 'corporal' };
const tuya = (ultimaKg: number | null = null, lastre = false): CargaFuerza => ({ tipo: 'tuya', ultimaKg, lastre });
const rir = (n: number): EsfuerzoFuerza => ({ eje: 'rir', min: n, max: n });
const rpe = (n: number): EsfuerzoFuerza => ({ eje: 'rpe', min: n, max: n });

function objetivosDe(carga: CargaFuerza, esfuerzo: EsfuerzoFuerza | null): Objetivo[] {
  const o: Objetivo[] = [];
  if (esfuerzo) o.push({ eje: esfuerzo.eje, min: esfuerzo.min, max: esfuerzo.max, papel: 'principal' });
  const papel = esfuerzo ? 'secundario' : 'principal';
  if (carga.tipo === 'rm') o.push({ eje: 'pctRM', min: carga.pctMin, max: carga.pctMax, papel });
  if (carga.tipo === 'kg') o.push({ eje: 'kg', min: carga.min, max: carga.max, papel });
  return o;
}

/** Una serie de trabajo (o de aproximación) de un ejercicio. */
function serie(d: DefEjercicio, n: number, bloque: number, aprox?: { reps: number; kg: number; de: number }): PasoFuerza {
  const carga: CargaFuerza = aprox ? { tipo: 'kg', min: aprox.kg, max: aprox.kg } : d.carga;
  const esfuerzo = aprox ? null : (d.esfuerzo ?? null);
  const iso = d.segundos != null && !aprox;
  return {
    id: `${d.clave}-${aprox ? 'a' : 's'}${n}`,
    clase: 'fuerza',
    rol: 'trabajo',
    fase: aprox ? 'calentamiento' : 'principal',
    nombre: d.nombre,
    medida: iso
      ? { tipo: 'tiempo', prescrito: d.segundos!, mide: 'reloj' }
      : { tipo: 'reps', prescrito: aprox?.reps ?? d.reps ?? 0, mide: d.mide ?? 'atleta' },
    objetivos: objetivosDe(carga, esfuerzo),
    posicion: { serie: { n, de: aprox ? aprox.de : d.series }, slot: d.slot },
    tempo: aprox ? undefined : d.tempo,
    cue: aprox ? undefined : d.cue,
    cierre: iso ? 'medida' : 'atleta',
    bloque,
    fuerza: { ejercicio: d.clave, carga, esfuerzo, porLado: d.porLado, aproximacion: !!aprox, pasoKg: d.pasoKg ?? BARRA },
  };
}

let n = 0;
const uid = (p: string) => `${p}-${++n}`;

function descanso(s: number, bloque: number, fase: PasoBase['fase'] = 'principal'): PasoBase {
  return { id: uid('descanso'), clase: 'descanso', rol: 'descanso', fase, medida: { tipo: 'tiempo', prescrito: s, mide: 'reloj' }, objetivos: [], cierre: 'medida', bloque };
}

/** «Colócate»: el paso corto antes de una isometría que no viene de un descanso (con su 3-2-1). */
function colocate(bloque: number): PasoBase {
  return { id: uid('colocate'), clase: 'fuerza', rol: 'transicion', fase: 'principal', medida: { tipo: 'tiempo', prescrito: COLOCATE_S_DEFECTO, mide: 'reloj' }, objetivos: [], cierre: 'medida', bloque };
}

/** Un ejercicio suelto: aproximaciones, N series y su descanso detrás de cada una (también de la última). */
function ejercicio(d: DefEjercicio, descansoS: number, bloque: number, descansoAproxS = 90): PasoBase[] {
  const out: PasoBase[] = [];
  const ap = d.aproximaciones ?? [];
  ap.forEach((a, k) => {
    out.push(serie(d, k + 1, bloque, { ...a, de: ap.length }));
    out.push(descanso(descansoAproxS, bloque, 'calentamiento'));
  });
  for (let k = 1; k <= d.series; k++) {
    const previo = out[out.length - 1];
    if (d.segundos != null && previo && previo.rol === 'trabajo') out.push(colocate(bloque));
    out.push(serie(d, k, bloque));
    if (descansoS > 0) out.push(descanso(descansoS, bloque));
  }
  return out;
}

/**
 * Una superserie: A1 → A2 (→ A3…) sin descanso, el descanso detrás de la
 * ronda. El de la última ronda cambia de bloque (`bloqueFinal`): así el
 * «bloque hecho» (.success) suena al cerrar la última serie, no al empezar
 * el bloque siguiente (que se quedaría sin su GO).
 */
function superserie(defs: DefEjercicio[], rondas: number, descansoS: number, bloque: number, bloqueFinal = bloque): PasoBase[] {
  const out: PasoBase[] = [];
  for (let k = 1; k <= rondas; k++) {
    defs.forEach((d, x) => {
      if (d.segundos != null && x > 0) out.push(colocate(bloque));
      out.push(serie(d, k, bloque));
    });
    out.push(descanso(descansoS, k === rondas ? bloqueFinal : bloque));
  }
  return out;
}

function estacion(nombre: string, veces: number, m: number, descansoS: number, bloque: number, kg?: number, implementos?: number): PasoBase[] {
  const out: PasoBase[] = [];
  for (let k = 1; k <= veces; k++) {
    out.push({
      id: uid('estacion'),
      clase: 'estacion',
      rol: 'trabajo',
      fase: 'principal',
      nombre,
      medida: { tipo: 'distancia', prescrito: m, mide: 'atleta' },
      objetivos: [],
      carga: kg != null ? { kg, implementos } : undefined,
      posicion: { serie: { n: k, de: veces } },
      cierre: 'atleta',
      bloque,
    });
    if (k < veces || descansoS > 0) out.push(descanso(descansoS, bloque));
  }
  return out;
}

const plan = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

// ---------------------------------------------------------------------------
// 529 · A: Back Squat 4 × 8 @65–70 % RM + Box Jump 4 × 6, r 2′ ·
//       B: Deadlift 4 × 8 @RIR 3 + Bulgarian Split Squat 4 × 6 @RIR 3, r 2′ ·
//       Sled Push 6 × 15 m r 90″ · Sandbag Lunges 4 × 25 m r 1′
// ---------------------------------------------------------------------------

export function sesion529(): PlanSesion {
  const mov: PasoBase = { id: '529-mov', clase: 'movilidad', rol: 'trabajo', fase: 'calentamiento', nombre: 'Hip mobility flow', medida: { tipo: 'tiempo', prescrito: 480, mide: 'reloj' }, objetivos: [], cierre: 'medida', bloque: 0 };
  const a1: DefEjercicio = { clave: '529-A1', nombre: 'Back Squat', slot: 'A1', series: 4, reps: 8, carga: rm(65, 70, RM_SENTADILLA), cue: 'concéntrica explosiva' };
  const a2: DefEjercicio = { clave: '529-A2', nombre: 'Box Jump', slot: 'A2', series: 4, reps: 6, carga: corporal };
  const b1: DefEjercicio = { clave: '529-B1', nombre: 'Deadlift', slot: 'B1', series: 4, reps: 8, carga: tuya(140), esfuerzo: rir(3) };
  const b2: DefEjercicio = { clave: '529-B2', nombre: 'Bulgarian Split Squat', slot: 'B2', series: 4, reps: 6, carga: tuya(), esfuerzo: rir(3), pasoKg: MANCUERNA };
  return plan([
    mov,
    ...superserie([a1, a2], 4, 120, 1, 2),
    ...superserie([b1, b2], 4, 120, 2, 3),
    ...estacion('Sled Push', 6, 15, 90, 3),
    ...estacion('Sandbag Lunges', 4, 25, 60, 3).slice(0, -1),
  ]);
}

// ---------------------------------------------------------------------------
// 488 · Back Squat 4 × 6 @RPE 6,5 (@72 % 1RM) r 2′ · Front Squat 3 × 8 @RPE 7
//       r 90″ · BSS 3 × 10 por pierna @RPE 7 r 1′ · Weighted pull-up 4 × 6
//       @RPE 7 r 90″ · Ab Wheel 3 × 10 r 45″ · SkiErg 8 × 250 m @RPE 8,5 r 45″
// ---------------------------------------------------------------------------

export function sesion488(): PlanSesion {
  const mov: PasoBase = { id: '488-mov', clase: 'movilidad', rol: 'trabajo', fase: 'calentamiento', nombre: 'Hip mobility flow', medida: { tipo: 'abierta', prescrito: null, mide: 'atleta' }, objetivos: [], cierre: 'atleta', bloque: 0 };
  const bs: DefEjercicio = {
    clave: '488-bs',
    nombre: 'Back Squat',
    series: 4,
    reps: 6,
    carga: rm(72, 72, RM_SENTADILLA),
    esfuerzo: rpe(6.5),
    aproximaciones: [
      { reps: 5, kg: 60 },
      { reps: 3, kg: 100 },
    ],
  };
  const fs: DefEjercicio = { clave: '488-fs', nombre: 'Front Squat', series: 3, reps: 8, carga: tuya(), esfuerzo: rpe(7) };
  const bss: DefEjercicio = { clave: '488-bss', nombre: 'Bulgarian Split Squat', series: 3, reps: 10, carga: tuya(), esfuerzo: rpe(7), porLado: 'pierna', pasoKg: MANCUERNA };
  const pu: DefEjercicio = { clave: '488-pu', nombre: 'Weighted pull-up', series: 4, reps: 6, carga: tuya(null, true), esfuerzo: rpe(7), pasoKg: 1.25 };
  const ab: DefEjercicio = { clave: '488-ab', nombre: 'Ab Wheel', series: 3, reps: 10, carga: corporal };
  const ski: PasoBase[] = [];
  for (let k = 1; k <= 8; k++) {
    ski.push({ id: `488-ski-${k}`, clase: 'ergo', rol: 'trabajo', fase: 'principal', nombre: 'SkiErg', medida: { tipo: 'distancia', prescrito: 250, mide: 'ergo' }, objetivos: [{ eje: 'rpe', min: 8.5, max: 8.5, papel: 'principal' }], maquina: { tipo: 'ski', damper: 7 }, posicion: { serie: { n: k, de: 8 } }, cierre: 'medida', bloque: 2 });
    if (k < 8) ski.push(descanso(45, 2));
  }
  return plan([mov, ...ejercicio(bs, 120, 1), ...ejercicio(fs, 90, 1), ...ejercicio(bss, 60, 1), ...ejercicio(pu, 90, 1), ...ejercicio(ab, 45, 1), ...ski]);
}

// ---------------------------------------------------------------------------
// 492 · Run 6′ @Z2 · Deadlift 4 × 4 @RPE 7,5 (@78 % 1RM) r 2′ · RDL 3 × 8
//       @RPE 7 r 90″ · Barbell Row 4 × 8 @RPE 7 r 75″ · Sled Push 5 × 25 m
//       @180 kg · Sled Pull 5 × 25 m @135 kg · Farmers 4 × 100 m @2 × 32 kg
// ---------------------------------------------------------------------------

export function sesion492(): PlanSesion {
  const run: PasoBase = { id: '492-run', clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', nombre: 'Run', medida: { tipo: 'tiempo', prescrito: 360, mide: 'reloj' }, objetivos: [{ eje: 'zona', min: 2, max: 2, papel: 'principal', avisa: 'solo-arriba' }], cierre: 'medida', bloque: 0 };
  const dl: DefEjercicio = { clave: '492-dl', nombre: 'Deadlift', series: 4, reps: 4, carga: rm(78, 78, RM_PESO_MUERTO), esfuerzo: rpe(7.5) };
  const rdl: DefEjercicio = { clave: '492-rdl', nombre: 'Romanian Deadlift', series: 3, reps: 8, carga: tuya(), esfuerzo: rpe(7) };
  const row: DefEjercicio = { clave: '492-row', nombre: 'Barbell Row', series: 4, reps: 8, carga: tuya(), esfuerzo: rpe(7) };
  return plan([
    run,
    ...ejercicio(dl, 120, 1),
    ...ejercicio(rdl, 90, 1),
    ...ejercicio(row, 75, 1),
    ...estacion('Sled Push', 5, 25, 90, 2, 180),
    ...estacion('Sled Pull', 5, 25, 90, 2, 135),
    ...estacion('Farmers Carry', 4, 100, 90, 2, 32, 2).slice(0, -1),
  ]);
}

// ---------------------------------------------------------------------------
// 538 · Glúteo medio (Side Plank 3 × 20″ · SL Glute Bridge 3 × 8 · Side Step
//       Squat 3 × 8 · Extensión de cadera 3 × 10) · Superserie: Plank 3 × 10 ·
//       Isometría en puente de glúteo 3 × 20″ · Push-up 3 × 10 · Push-up 3 × 3,
//       r 1′ · y la carrera (sus pasos viven en «Muñeca · correr»)
// ---------------------------------------------------------------------------

export function sesion538(): PlanSesion {
  const g = (clave: string, nombre: string, extra: Partial<DefEjercicio>): DefEjercicio => ({ clave, nombre, series: 3, carga: corporal, ...extra });
  const run: PasoBase = { id: '538-run', clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', nombre: 'Run', medida: { tipo: 'tiempo', prescrito: 600, mide: 'reloj' }, objetivos: [{ eje: 'ritmo', min: 320, max: 320, papel: 'principal' }], cierre: 'medida', bloque: 2 };
  return plan([
    ...ejercicio(g('538-sp', 'Side Plank', { segundos: 20 }), 0, 0),
    ...ejercicio(g('538-slgb', 'Single Leg Glute Bridge', { reps: 8 }), 0, 0),
    ...ejercicio(g('538-sss', 'Side Step Squat With Band', { reps: 8 }), 0, 0),
    ...ejercicio(g('538-ext', 'Extensión de cadera en cuadrupedia', { reps: 10 }), 0, 0),
    ...superserie(
      [
        g('538-A1', 'Plank', { slot: 'A1', reps: 10 }),
        g('538-A2', 'Isometría en puente de glúteo', { slot: 'A2', segundos: 20 }),
        g('538-A3', 'Push-up', { slot: 'A3', reps: 10 }),
        g('538-A4', 'Push-up', { slot: 'A4', reps: 3 }),
      ],
      3,
      60,
      1,
      2,
    ),
    run,
  ]);
}

// ---------------------------------------------------------------------------
// El ejemplo del modelo (P11): Back Squat 5 × 5 · 100 kg · RIR 2 · 3-1-1,
// con las reps contadas por el reloj (sensor) y la velocidad de la barra.
// ---------------------------------------------------------------------------

export function ejemploP11(): PlanSesion {
  const bs: DefEjercicio = {
    clave: 'p11-bs',
    nombre: 'Back Squat',
    series: 5,
    reps: 5,
    carga: { tipo: 'kg', min: 100, max: 100 },
    esfuerzo: rir(2),
    tempo: { excentrica: 3, pausaAbajo: 1, concentrica: 1, pausaArriba: 0 },
    mide: 'sensor',
  };
  return plan(ejercicio(bs, 120, 0).slice(0, -1));
}

/** El índice del paso con ese id (los escenarios arrancan a mitad de sesión). */
export function indiceDe(p: PlanSesion, id: string): number {
  const i = p.pasos.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`Paso ${id} no está en el plan`);
  return i;
}
