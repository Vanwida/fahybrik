// El plan del atleta: la semana que estás viviendo, dentro del bloque.
//
// Todo lo que se pinta sale de las cuatro sesiones reales de `datos-reales.ts`
// (plantillas 441, 442, 497 y 500) y de sus ejecuciones medidas. Lo único que
// se añade aquí es la ESTRUCTURA que la app sí tiene y ese fichero no modela:
// en qué día cae cada sesión, en qué semana del bloque estás y qué escribió el
// coach para esa semana. Los textos de intención son voz del COACH: el sistema
// no bautiza fases ni inventa nombres de bloque.
//
// Tres reglas que gobiernan este fichero:
//
//  1. Los minutos de una sesión que aún no ha pasado son el reloj que la
//     PRESCRIPCIÓN deja escrito, y se pintan con «unos». Los de una sesión hecha
//     son la medida real de `workout_executions.total_duration_seconds` y se
//     pintan sin adorno. Nunca se mezclan. Y cuando la prescripción no escribe
//     reloj no hay número: se dice por qué (`DuracionPrevista`).
//  2. Un día sin sesión no fabrica nada (§7). Es descanso y se dibuja como tal.
//  3. Aquí NO se dibuja volumen previsto de semanas futuras. Lo planificado se
//     pinta con seguridad —qué sesiones hay, en qué día caen—; lo MEDIDO del
//     futuro no existe todavía. La vista de hacia dónde va el atleta es
//     `plan-ciclo`, que existe precisamente para contar la estructura sin
//     inventarse una curva de carga.

import type { Modalidad, SesionReal } from '../../datos-reales';
import type { DurationUnknownReason } from '@fahybrid/shared/domain/prescription';
import {
  BACK_SQUAT,
  CIRCUITO_PIERNA,
  dosisConSeries,
  HYROX,
  MEDIDO_CIRCUITO,
  MEDIDO_REMO,
  MEDIDO_SQUAT,
  REMO_500,
} from '../../datos-reales';

// ---------------------------------------------------------------------------
// El modelo
// ---------------------------------------------------------------------------

/** Un número de la dosis y qué es, en una palabra. Máximo tres por sesión. */
export interface ClaveDosis {
  valor: string;
  etiqueta: string;
}

export interface SesionPlan {
  /** La sesión de producción. El título sale de aquí; no se reescribe. */
  ref: SesionReal;
  /** La línea de formato, cuando la plantilla la trae. */
  formato?: string;
  /**
   * Las modalidades que MANDAN en la sesión, para los puntos del carril. Como
   * mucho dos: en una ficha de 46 pt un tercer punto ya no se distingue, y un
   * resumen corto no es una medida falsa.
   */
  modalidades: Modalidad[];
  /**
   * El reloj que la prescripción deja ESCRITO, o por qué no lo deja. Jamás se
   * presenta como una medida, y jamás se rellena con un número plausible: es la
   * misma regla que aplica el servidor en
   * `shared/domain/prescription/duration.ts`, con el mismo vocabulario.
   */
  duracion: DuracionPrevista;
  claves: ClaveDosis[];
}

/**
 * O hay minutos escritos, o hay una razón por la que no los hay. No existe el
 * tercer caso «un número aproximado»: eso era el bug.
 */
export type DuracionPrevista = { minutos: number } | { razon: DurationUnknownReason };

export interface SesionDelDia {
  plan: SesionPlan;
  /**
   * Minutos REALES de la ejecución registrada. `null` = no hay ejecución, y
   * entonces no hay ningún tiempo que enseñar de ese día.
   */
  hechaMin: number | null;
}

export interface DiaPlan {
  inicial: string;
  nombre: string;
  /** Día del mes. */
  numero: number;
  sesiones: SesionDelDia[];
}

export interface SemanaPlan {
  /** Siempre siete, de lunes a domingo. */
  dias: DiaPlan[];
  indiceHoy: number;
  /** Una línea, escrita por el coach para esta semana. */
  intencion: string;
}

export interface BloquePlan {
  /** Lo escribe el coach. El sistema no nombra fases. */
  nombre: string;
  totalSemanas: number;
}

export interface EscenarioPlan {
  bloque: BloquePlan;
  /** 1-based, como se lee: «semana 3 de 6». */
  semanaActual: number;
  semana: SemanaPlan;
}

/** Cuatro estados posibles de un día. `esHoy` es aparte: es otra dimensión. */
export type EstadoDia = 'hecha' | 'saltada' | 'pendiente' | 'descanso';

// ---------------------------------------------------------------------------
// Las cuatro sesiones, con su dosis clave y su estimación
// ---------------------------------------------------------------------------

/** Los minutos que de verdad duró una ejecución, redondeados a minuto. */
function minutosMedidos(duracionS: number): number {
  return Math.max(1, Math.round(duracionS / 60));
}

export const SESION_HYROX: SesionPlan = {
  ref: HYROX,
  // Tal cual la trae la plantilla 441: dieciséis estaciones contando las ocho
  // carreras. No se reescribe para que cuadre con las claves de abajo.
  formato: HYROX.bloques[1].formato,
  modalidades: ['run', 'functional'],
  // La plantilla 441 es `for_time` de punta a punta: la duración ES el
  // resultado. El «95 min» que había aquí era un número a ojo para una sesión
  // que por definición no lo tiene.
  duracion: { razon: 'scored_by_time' },
  claves: [
    { valor: '8 km', etiqueta: 'corriendo' }, // los ocho Run de 1,00 km
    { valor: '152 kg', etiqueta: 'trineo' }, // Sled Push
    { valor: '100', etiqueta: 'wall balls' }, // 100 reps a 6 kg
  ],
};

export const SESION_SQUAT: SesionPlan = {
  ref: BACK_SQUAT,
  modalidades: ['strength'],
  // 4×5 a 100 kg con 90 s de descanso: las repeticiones no traen tempo, así que
  // el trabajo no tiene reloj escrito. El «10 min» que había aquí no salía de la
  // prescripción — salía de la ejecución 162 (9:32), que es medir el futuro.
  duracion: { razon: 'work_not_timed' },
  claves: [
    // La grafía de la dosis sale del canónico, no de un literal: es justo el
    // dato que tres pantallas escribieron de tres maneras (§2.1).
    { valor: dosisConSeries(BACK_SQUAT.bloques[0].items[0]) ?? '', etiqueta: 'series' },
    { valor: '100 kg', etiqueta: 'carga' },
    { valor: '90 s', etiqueta: 'descanso' },
  ],
};

export const SESION_CIRCUITO: SesionPlan = {
  ref: CIRCUITO_PIERNA,
  modalidades: ['strength', 'functional'],
  // Tres de los cuatro ítems de trabajo de la 442 llegan vacíos: la
  // prescripción no dice cuánto trabajo hacer, así que no hay reloj que sumar.
  // El «50 min» que había aquí estaba derivado de la ejecución 103 (52:00) —
  // exactamente lo medido del futuro presentado como lo planificado.
  duracion: { razon: 'undosed' },
  // Tres de los cuatro ejercicios de fuerza llegan SIN dosis desde la
  // plantilla 442. No se rellena el hueco: la única clave es la que existe.
  claves: [{ valor: '30 kg', etiqueta: 'zancada' }],
};

export const SESION_REMO: SesionPlan = {
  ref: REMO_500,
  modalidades: ['row'],
  // La única de las cuatro que SÍ se puede saber, y sin estimar nada: 500 m
  // contra un ritmo prescrito de 1:52/500m son 112 s. Aritmética del plan.
  duracion: { minutos: 2 },
  claves: [
    { valor: '500 m', etiqueta: 'distancia' },
    { valor: '1:52/500m', etiqueta: 'ritmo' },
  ],
};

// ---------------------------------------------------------------------------
// El calendario
// ---------------------------------------------------------------------------

const NOMBRES: ReadonlyArray<{ inicial: string; nombre: string }> = [
  { inicial: 'L', nombre: 'lunes' },
  { inicial: 'M', nombre: 'martes' },
  { inicial: 'X', nombre: 'miércoles' },
  { inicial: 'J', nombre: 'jueves' },
  { inicial: 'V', nombre: 'viernes' },
  { inicial: 'S', nombre: 'sábado' },
  { inicial: 'D', nombre: 'domingo' },
];

function dia(indice: number, numero: number, sesiones: SesionDelDia[] = []): DiaPlan {
  return { ...NOMBRES[indice], numero, sesiones };
}

const BLOQUE: BloquePlan = {
  nombre: 'Bloque 2 · fuerza y ritmo',
  totalSemanas: 6,
};

/**
 * La semana 3 del bloque, la misma en los escenarios de carga y de descanso:
 * cambia el día en el que estás, no el plan. Lo que varía es qué se ha llegado
 * a hacer, que es lo que la app sabe de verdad.
 */
function semanaTres(indiceHoy: number, hechos: readonly number[]): SemanaPlan {
  const marca = (indice: number, plan: SesionPlan, duracionS: number): SesionDelDia =>
    hechos.includes(indice) ? { plan, hechaMin: minutosMedidos(duracionS) } : { plan, hechaMin: null };

  return {
    indiceHoy,
    intencion: 'Semana fuerte: acumulamos volumen y cerramos con la simulación entera.',
    dias: [
      dia(0, 27, [marca(0, SESION_REMO, MEDIDO_REMO.duracionS)]),
      dia(1, 28, [marca(1, SESION_SQUAT, MEDIDO_SQUAT.duracionS)]),
      dia(2, 29, [marca(2, SESION_CIRCUITO, MEDIDO_CIRCUITO.duracionS)]),
      dia(3, 30),
      dia(4, 31, [{ plan: SESION_HYROX, hechaMin: null }]),
      dia(5, 1, [{ plan: SESION_CIRCUITO, hechaMin: null }]),
      dia(6, 2),
    ],
  };
}

/** La última semana del bloque: mismo plan, la mitad de volumen. */
function semanaSeis(): SemanaPlan {
  return {
    indiceHoy: 2,
    intencion: 'Semana de descarga: bajamos el volumen casi a la mitad para asimilar todo el bloque.',
    dias: [
      // Prescrita y sin ejecución con el día ya pasado: saltada.
      dia(0, 17, [{ plan: SESION_CIRCUITO, hechaMin: null }]),
      dia(1, 18, [{ plan: SESION_REMO, hechaMin: minutosMedidos(MEDIDO_REMO.duracionS) }]),
      dia(2, 19, [{ plan: SESION_SQUAT, hechaMin: null }]),
      dia(3, 20),
      dia(4, 21, [{ plan: SESION_CIRCUITO, hechaMin: null }]),
      dia(5, 22, [{ plan: SESION_REMO, hechaMin: null }]),
      dia(6, 23),
    ],
  };
}

export function planDeEscenario(id: string): EscenarioPlan {
  switch (id) {
    case 'descarga':
      return { bloque: BLOQUE, semanaActual: 6, semana: semanaSeis() };
    case 'descanso':
      // Jueves: no hay nada en el plan, y las tres sesiones de atrás sí se hicieron.
      return { bloque: BLOQUE, semanaActual: 3, semana: semanaTres(3, [0, 1, 2]) };
    case 'semana-carga':
    default:
      // Viernes: el miércoles quedó sin hacer y hoy toca la simulación.
      return { bloque: BLOQUE, semanaActual: 3, semana: semanaTres(4, [0, 1]) };
  }
}

// ---------------------------------------------------------------------------
// Lecturas — todo lo que la pantalla enseña se deriva aquí, una sola vez
// ---------------------------------------------------------------------------

export function estadoDia(diaPlan: DiaPlan, indice: number, indiceHoy: number): EstadoDia {
  if (diaPlan.sesiones.length === 0) return 'descanso';
  // Con dos sesiones y una hecha el día ya cuenta como trabajado: el sello dice
  // que hubo trabajo, no que se cerrara el día entero.
  if (diaPlan.sesiones.some((s) => s.hechaMin !== null)) return 'hecha';
  return indice < indiceHoy ? 'saltada' : 'pendiente';
}

// RETIRADO (29-jul): `minutosPrevistosSemana`, `rampaDelBloque`, `esDescarga`,
// `lecturaRampa` y `horasPrevistas`, junto con el array `previstas` del bloque.
//
// Dibujaban una rampa de volumen previsto por semana — `[165, 195, 207, 240,
// 260, 114]` — para las semanas 4, 5 y 6 de un bloque de 6. Ninguno de esos
// números existía: en producción no hay ni un solo bloque de seis semanas (los
// reales son de 1, 2 y 4) ni ninguna plantilla con ese nombre, y los minutos de
// la semana actual se sumaban de unas estimaciones por sesión que a su vez
// salían de las EJECUCIONES.
//
// La ley que violaba: lo planificado se pinta con seguridad; lo medido del
// futuro no existe. Una barra de volumen para dentro de tres semanas afirma
// cuánto va a entrenar alguien que todavía no ha entrenado. Hacia dónde va el
// atleta lo cuenta `plan-ciclo`, que se escribió justo para eso y cuya cabecera
// ya dice por qué no lleva ninguna curva de carga.

export interface DiaConSesion {
  dia: DiaPlan;
  sesion: SesionDelDia;
}

/** La última sesión antes de hoy, si la semana la tiene. */
export function sesionAnterior(semana: SemanaPlan): DiaConSesion | null {
  for (let i = semana.indiceHoy - 1; i >= 0; i -= 1) {
    const d = semana.dias[i];
    if (d.sesiones.length > 0) return { dia: d, sesion: d.sesiones[d.sesiones.length - 1] };
  }
  return null;
}

/** La siguiente sesión de la semana. `null` = la semana ya está cerrada. */
export function sesionSiguiente(semana: SemanaPlan): DiaConSesion | null {
  for (let i = semana.indiceHoy + 1; i < semana.dias.length; i += 1) {
    const d = semana.dias[i];
    if (d.sesiones.length > 0) return { dia: d, sesion: d.sesiones[0] };
  }
  return null;
}
