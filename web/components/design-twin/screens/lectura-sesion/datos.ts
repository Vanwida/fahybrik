// LOS TRES ESCENARIOS — la prueba de que un solo sujeto sirve a formatos
// distintos, sin ramas raras en la pantalla.
//
// ① «Fuerza B + Trineos» es la sesión REAL del 20-ago que abrió la card 118:
// ocho tramos, sus duraciones y su pulso medio, tal y como los dio Alex. NO
// se le añade ni un metro, ni una serie, ni una carga que no viniera dicha —
// donde el dato no está, el bloque simplemente no lo lleva (§7): esa sesión
// tuvo la cinta sin conectar (otra card) y ninguna carga de hierro logueada,
// y ESO es exactamente lo que hay que poder leer bien.
//
// ② «Simulacro HYROX» y ③ «Fuerza pura» son EJECUCIONES SIMULADAS —lo pide el
// encargo—: plausibles y coherentes con lo prescrito, pero inventadas. Se
// declaran como tal en `procedencia` y en la descripción del escenario.

import { SIGNO_POR } from '../../datos-reales';
import type { Bloque, Sesion } from './modelo';

// ---------------------------------------------------------------------------
// ① Fuerza B + Trineos — datos reales, 20 de agosto
// ---------------------------------------------------------------------------

const FUERZA_TRINEOS: Sesion = {
  titulo: 'Fuerza B + Trineos',
  cuando: 'Hoy',
  completitud: { completa: true },
  formato: { clase: 'libre' },
  duracionTotalS: 2822, // 47:02, tal y como lo cerró el entreno
  bloques: [
    { modalidad: 'correr', etiqueta: 'Calentamiento', duracionS: 360, distanciaM: null, fcMediaPpm: null },
    { modalidad: 'correr', etiqueta: 'Rodaje', duracionS: 357, distanciaM: null, fcMediaPpm: 139 },
    { modalidad: 'fuerza', etiqueta: 'Peso muerto', duracionS: 669, grupos: null, descansoS: null, fcMediaPpm: 128 },
    { modalidad: 'fuerza', etiqueta: 'Peso muerto rumano', duracionS: 426, grupos: null, descansoS: null, fcMediaPpm: 113 },
    { modalidad: 'fuerza', etiqueta: 'Remo con barra', duracionS: null, grupos: null, descansoS: null, fcMediaPpm: 112 },
    { modalidad: 'fuerza', etiqueta: 'Fuerza', duracionS: null, grupos: null, descansoS: null, fcMediaPpm: 115 },
    { modalidad: 'funcional', etiqueta: 'Trineos', duracionS: 260, reps: null, metros: null, fcMediaPpm: 121 },
    { modalidad: 'funcional', etiqueta: 'Trineos', duracionS: null, reps: null, metros: null, fcMediaPpm: 107 },
  ],
  dicho: { rpe: 10, dificultad: 'as_expected' },
  procedencia:
    'Datos reales del 20 de agosto. Sin metros de carrera (la cinta no llegó a conectarse, otra card) y sin carga de hierro logueada esa sesión: por eso esos recuadros no existen, y no es un error de la pantalla.',
};

// ---------------------------------------------------------------------------
// ② Simulacro HYROX — ejecución SIMULADA de la plantilla 687 real
// ---------------------------------------------------------------------------
//
// NUEVE bloques, no treinta y dos: la plantilla prescribe cuatro RONDAS ya
// expandidas una a una (correr 1.000 m + su estación), no cuatro repeticiones
// de un circuito de ocho. Las notas del coach lo dicen literalmente —«Ronda
// 1. A race pace» / «Cierra la ronda 1» / «Ronda 2» / … / «Cierra la ronda
// 4»—, y son las que fijan qué bloque abre y cuál cierra cada ronda.

/** Una ronda: correr 1 km a ritmo de carrera + su estación de cierre. */
function ronda(n: number, estacion: Bloque): Bloque[] {
  // El ritmo de correr sube 5 s/km por ronda (4:15 → 4:30) y el pulso con él,
  // de Z3 en la primera a Z5 en la última: «RPE 8» a ritmo de carrera, con la
  // fatiga acumulándose ronda a ronda.
  const correrSkm = 255 + n * 5;
  const pulsoCorrer = 146 + n * 6;
  return [
    { modalidad: 'correr', etiqueta: 'Correr', duracionS: correrSkm, distanciaM: 1000, fcMediaPpm: pulsoCorrer, ronda: n },
    { ...estacion, ronda: n },
  ];
}

const BLOQUES_SIMULACRO: Bloque[] = [
  // Calentamiento, fuera de las rondas: por tiempo y zona, no por distancia.
  { modalidad: 'correr', etiqueta: 'Calentamiento', duracionS: 360, distanciaM: null, fcMediaPpm: 138 },
  ...ronda(1, { modalidad: 'ergometro', etiqueta: 'Ski erg', maquina: 'ski', duracionS: 115, distanciaM: 500, fcMediaPpm: 158, descansoS: 120 }),
  // Burpee Broad Jump, no trineo (Alex, 20-ago: resuelto contra el catálogo
  // real). Es funcional medido en METROS, no en reps — y mucho más lento que
  // empujar un trineo: 40 m a burpee + salto son ~30 reps, no 30 segundos.
  ...ronda(2, { modalidad: 'funcional', etiqueta: 'Burpee Broad Jump', duracionS: 75, reps: null, metros: 40, fcMediaPpm: 168, descansoS: 120 }),
  ...ronda(3, { modalidad: 'ergometro', etiqueta: 'Remo', maquina: 'remo', duracionS: 118, distanciaM: 500, fcMediaPpm: 170, descansoS: 120 }),
  ...ronda(4, { modalidad: 'funcional', etiqueta: 'Wall balls · 9 kg', duracionS: 65, reps: 25, metros: null, fcMediaPpm: 176, descansoS: 120 }),
];

// El total incluye el trabajo Y los descansos prescritos: los 2′ entre
// estaciones son tiempo real que pasa, no un hueco que el reloj se salta.
const DURACION_SIMULACRO = BLOQUES_SIMULACRO.reduce((acc, b) => acc + (b.duracionS ?? 0) + (b.descansoS ?? 0), 0);

const SIMULACRO_HYROX: Sesion = {
  titulo: 'Simulacro HYROX',
  cuando: 'Hoy',
  completitud: { completa: true },
  formato: { clase: 'for-time' },
  duracionTotalS: DURACION_SIMULACRO,
  bloques: BLOQUES_SIMULACRO,
  dicho: { rpe: 9, dificultad: 'as_expected' },
  procedencia:
    'Plantilla 687 real: calentamiento + 4 rondas de correr 1.000 m a RPE 8 cerradas con ski, burpee broad jump, remo y 25 wall balls de 9 kg. La ejecución (ritmo, pulso) es simulada — la plantilla no trae todavía una sesión ejecutada.',
};

// ---------------------------------------------------------------------------
// ③ Fuerza pura — ejecución SIMULADA, sin correr ni ergo
// ---------------------------------------------------------------------------

const FUERZA_PURA: Sesion = {
  titulo: 'Fuerza · Tren inferior y empuje',
  cuando: 'Hoy',
  completitud: { completa: true },
  formato: { clase: 'fuerza' },
  // Sin pulso en ningún bloque: una sesión de hierro sin pulsómetro puesto es
  // el caso más común de la base, y aquí sirve para probar que sin FC no hay
  // barra de zonas — no una barra vacía, ninguna barra (§7).
  duracionTotalS: 32 * 60,
  bloques: [
    {
      modalidad: 'fuerza',
      etiqueta: 'Sentadilla',
      duracionS: 13 * 60,
      grupos: [{ sets: 5, reps: 5, kg: 100 }],
      descansoS: 150,
      fcMediaPpm: null,
    },
    {
      modalidad: 'fuerza',
      etiqueta: 'Press banca',
      duracionS: 11 * 60,
      grupos: [{ sets: 4, reps: 8, kg: 70 }],
      descansoS: 120,
      fcMediaPpm: null,
    },
    {
      modalidad: 'fuerza',
      etiqueta: 'Dominadas',
      duracionS: 8 * 60,
      // Peso corporal: no hay carga que sumar al tonelaje (§7 del modelo).
      grupos: [{ sets: 4, reps: 8, kg: null }],
      descansoS: 90,
      fcMediaPpm: null,
    },
  ],
  dicho: { rpe: 7, dificultad: 'as_expected' },
  procedencia:
    `Ejecución simulada: sentadilla 5${SIGNO_POR}5 a 100 kg, press banca 4${SIGNO_POR}8 a 70 kg y dominadas 4${SIGNO_POR}8 a peso corporal. No hay ejecución real de esta sesión todavía.`,
};

export const ESCENAS: Record<string, Sesion> = {
  'fuerza-trineos': FUERZA_TRINEOS,
  'simulacro-hyrox': SIMULACRO_HYROX,
  'fuerza-pura': FUERZA_PURA,
};
