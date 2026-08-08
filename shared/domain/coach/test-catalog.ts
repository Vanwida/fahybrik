// test-catalog — LOS TESTS QUE UN COACH HÍBRIDO PIDE DE VERDAD.
//
// Un test no es un entreno: es una MEDICIÓN. El coach no piensa «quiero un
// bloque continuo con medida distancia» — piensa «quiero medirle el 2K de remo»
// o «quiero su 1RM de sentadilla». Hacerle traducir su intención al vocabulario
// interno del editor (Carrera continua / WOD / EMOM…) es trabajo que le
// endosamos nosotros, y encima en un vocabulario donde el remo ni aparece.
//
// Esto es el atajo: elige el test, ya está montado. Cuatro familias, que son las
// que un híbrido mide:
//   · FUERZA      — el 1RM de los seis levantamientos que el motor sabe resolver
//   · ERGO        — remo, ski y bici
//   · CORRER      — pista, calle o cinta (lo elige el atleta al ejecutar)
//   · SIMULACIÓN  — HYROX
//
// CALIBRA solo el que puede: las fórmulas de zonas están ancladas en 5K de
// carrera, 2K de remo y 1K de ski, y el 1RM en esos seis lifts. Un 500 m de remo
// es una marca excelente para compararse consigo mismo, pero NO recalcula zonas
// — decir lo contrario sería inventarle los datos al atleta. Cada entrada lo
// dice explícitamente para que la UI no tenga que adivinarlo.
//
// NO es una lista cerrada: quien quiera otra cosa la monta a medida con el
// editor de siempre. Esto cubre el 90 % en dos clics.

import type { Prescription } from '../prescription/types';

/** Familia, tal y como el coach agrupa mentalmente. */
export type TestFamily = 'fuerza' | 'ergo' | 'correr' | 'simulacion';

export const TEST_FAMILY_LABEL: Record<TestFamily, string> = {
  fuerza: 'Fuerza · 1RM',
  ergo: 'Ergo',
  correr: 'Correr',
  simulacion: 'Simulación',
};

export const TEST_FAMILY_ORDER: readonly TestFamily[] = ['fuerza', 'ergo', 'correr', 'simulacion'];

export interface TestPreset {
  /** Id estable — también el nombre por defecto del test que crea. */
  id: string;
  family: TestFamily;
  /** Cara-coach, tal cual se pinta en la tarjeta. */
  label: string;
  /** La segunda línea: qué mide y qué calibra, en una frase. */
  hint: string;
  /** Candidatos de slug del catálogo de ejercicios, en orden de preferencia. */
  exercise: readonly string[];
  /** Nombre de respaldo si ningún slug resuelve (el coach lo cambia a mano). */
  exerciseLabel: string;
  /** La prescripción ya montada — esto es lo que evita el formulario. */
  prescription: Prescription;
  /** Bloque especial (HYROX) que se monta con su propia plantilla, no con esta
   *  prescripción. La UI lo detecta y delega. */
  hyrox?: 'full';
}

/** El esfuerzo de un test es siempre a tope: no se prescribe la intensidad, se
 *  MIDE el resultado. RPE 10 lo dice sin fingir un ritmo que aún no conocemos. */
const A_TOPE = { kind: 'rpe', value: 10 } as const;

type TestModality = 'run' | 'row' | 'ski' | 'bike';

function distancia(modality: TestModality, meters: number): Prescription {
  return { scheme: 'steady', modality, sets: [{ measure: { kind: 'distance', meters } }], target: A_TOPE };
}

function tiempo(modality: TestModality, seconds: number): Prescription {
  return { scheme: 'steady', modality, sets: [{ measure: { kind: 'duration', seconds } }], target: A_TOPE };
}

/** Un 1RM: una repetición al máximo. El protocolo (subir en series) lo pone el
 *  coach en la nota si quiere; lo que se MIDE es la carga. */
function unRM(): Prescription {
  return {
    scheme: 'sets',
    modality: 'strength',
    sets: [{ measure: { kind: 'reps', value: 1 } }],
    target: A_TOPE,
  };
}

export const TEST_PRESETS: readonly TestPreset[] = [
  // ── FUERZA · 1RM ─────────────────────────────────────────────────────────
  { id: 'Sentadilla · 1RM', family: 'fuerza', label: 'Sentadilla', hint: 'Se mide la carga · calibra tu 1RM',
    exercise: ['back-squat'], exerciseLabel: 'Sentadilla', prescription: unRM() },
  { id: 'Peso muerto · 1RM', family: 'fuerza', label: 'Peso muerto', hint: 'Se mide la carga · calibra tu 1RM',
    exercise: ['deadlift'], exerciseLabel: 'Peso muerto', prescription: unRM() },
  { id: 'Press banca · 1RM', family: 'fuerza', label: 'Press banca', hint: 'Se mide la carga · calibra tu 1RM',
    exercise: ['bench-press'], exerciseLabel: 'Press banca', prescription: unRM() },
  { id: 'Press militar · 1RM', family: 'fuerza', label: 'Press militar', hint: 'Se mide la carga · calibra tu 1RM',
    exercise: ['overhead-press', 'strict-press'], exerciseLabel: 'Press militar', prescription: unRM() },
  { id: 'Cargada · 1RM', family: 'fuerza', label: 'Cargada', hint: 'Se mide la carga · calibra tu 1RM',
    exercise: ['power-clean', 'clean', 'hang-power-clean'], exerciseLabel: 'Cargada', prescription: unRM() },
  { id: 'Arrancada · 1RM', family: 'fuerza', label: 'Arrancada', hint: 'Se mide la carga · calibra tu 1RM',
    exercise: ['snatch'], exerciseLabel: 'Arrancada', prescription: unRM() },

  // ── ERGO ─────────────────────────────────────────────────────────────────
  { id: 'Remo 2 km', family: 'ergo', label: 'Remo 2 km', hint: 'Se mide el tiempo · calibra tus zonas de remo',
    exercise: ['row', 'row-z2-long'], exerciseLabel: 'Remo', prescription: distancia('row', 2000) },
  { id: 'Remo 1 km', family: 'ergo', label: 'Remo 1 km', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['row', 'row-z2-long'], exerciseLabel: 'Remo', prescription: distancia('row', 1000) },
  { id: 'Remo 500 m', family: 'ergo', label: 'Remo 500 m', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['row', 'row-z2-long'], exerciseLabel: 'Remo', prescription: distancia('row', 500) },
  { id: 'Ski 1 km', family: 'ergo', label: 'Ski 1 km', hint: 'Se mide el tiempo · calibra tus zonas de ski',
    exercise: ['ski', 'ski-erg', 'skierg'], exerciseLabel: 'SkiErg', prescription: distancia('ski', 1000) },
  { id: 'Ski 500 m', family: 'ergo', label: 'Ski 500 m', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['ski', 'ski-erg', 'skierg'], exerciseLabel: 'SkiErg', prescription: distancia('ski', 500) },
  { id: 'Bici 10 min', family: 'ergo', label: 'Bici 10 min', hint: 'Se mide la distancia · se guarda como marca',
    exercise: ['bike', 'bike-erg', 'assault-bike'], exerciseLabel: 'Bici', prescription: tiempo('bike', 600) },

  // ── CORRER ───────────────────────────────────────────────────────────────
  { id: '5 km', family: 'correr', label: '5 km', hint: 'Se mide el tiempo · calibra tus zonas de carrera',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: distancia('run', 5000) },
  { id: '3 km', family: 'correr', label: '3 km', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: distancia('run', 3000) },
  { id: '1 milla', family: 'correr', label: '1 milla', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: distancia('run', 1609) },
  { id: 'Cooper · 12 min', family: 'correr', label: 'Cooper · 12 min', hint: 'Se mide la distancia · se guarda como marca',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: tiempo('run', 720) },
  { id: 'Umbral · 30 min', family: 'correr', label: 'Umbral · 30 min', hint: 'Se mide la distancia · se guarda como marca',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: tiempo('run', 1800) },

  // ── SIMULACIÓN ───────────────────────────────────────────────────────────
  { id: 'HYROX completo', family: 'simulacion', label: 'HYROX completo', hint: '8 carreras + 8 estaciones · se mide el tiempo',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: distancia('run', 1000), hyrox: 'full' },
  // HYROX half NO está aquí a propósito: `createHyroxSimBlock` solo monta la
  // carrera completa (8+8) y no acepta variante, así que ofrecer «half» pintaría
  // una etiqueta que el contenido no cumple. Se añade cuando la plantilla sepa
  // construirlo de verdad.
];

export const TEST_PRESETS_BY_FAMILY: Record<TestFamily, readonly TestPreset[]> = {
  fuerza: TEST_PRESETS.filter((p) => p.family === 'fuerza'),
  ergo: TEST_PRESETS.filter((p) => p.family === 'ergo'),
  correr: TEST_PRESETS.filter((p) => p.family === 'correr'),
  simulacion: TEST_PRESETS.filter((p) => p.family === 'simulacion'),
};
