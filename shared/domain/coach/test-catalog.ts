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
// editor de siempre («Añadir ejercicio»). Esto son ATAJOS, nunca un límite.
//
// FUENTES (8-ago-2026) — esta lista NO sale de la intuición:
//   · Curvas potencia/ritmo-duración estándar (Athletica field-testing playbook,
//     British Rowing testing protocols): remo 500 m · 1 k · 2 k · 5 k; carrera
//     400 m · 1 k · 5 k. De ahí salen las distancias, no de lo que sonaba bien.
//   · Estaciones HYROX: las 8 medidas oficiales (rulebook 26/27) YA NO se
//     retipean aquí — se leen de `shared/domain/hyrox/stations.ts`, la fuente
//     única (también dueña de la carga por división/género). Este fichero
//     solo decide CÓMO se prueba cada una (steady/for_time, modalidad
//     ski/row/functional), nunca CUÁNTO mide.
//   · Bici: el estándar de campo es el FTP de 20 min. Aquí se ofrece como «20
//     min» midiendo DISTANCIA, no como FTP: el FTP se mide en vatios y el
//     contrato de resultados (StoreResultMeasure) no tiene vatios todavía.
//     Llamarlo FTP sin poder capturar vatios sería una etiqueta falsa.

import type { Prescription } from '../prescription/types';
import { resolveHyroxStationBySlug, type HyroxStationSlug } from '../hyrox/stations';

/** Familia, tal y como el coach agrupa mentalmente. */
export type TestFamily = 'fuerza' | 'ergo' | 'correr' | 'estaciones' | 'simulacion';

export const TEST_FAMILY_LABEL: Record<TestFamily, string> = {
  fuerza: 'Fuerza · 1RM',
  ergo: 'Ergo',
  correr: 'Correr',
  estaciones: 'Estaciones HYROX',
  simulacion: 'Simulación',
};

// Orden HYROX-first: somos específicos de HYROX/híbrido, así que lo primero que
// ve el coach es la carrera y sus estaciones, no el 1RM. Correr va justo detrás
// porque es la MITAD de la carrera (8 × 1 km), no un complemento.
export const TEST_FAMILY_ORDER: readonly TestFamily[] = [
  'simulacion', 'estaciones', 'correr', 'ergo', 'fuerza',
];

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
  /** PROTOCOLO de varias estaciones (HYROX Conditioning Test): cuando está, el
   *  preset monta UN BLOQUE POR ESTACIÓN en orden, y `prescription`/`exercise`
   *  de arriba solo sirven de respaldo. */
  stations?: readonly TestStation[];
  /** Nota que se copia al test (el protocolo, para que el atleta lo lea antes). */
  note?: string;
}

/** Una estación dentro de un protocolo de varias. */
export interface TestStation {
  label: string;
  exercise: readonly string[];
  exerciseLabel: string;
  prescription: Prescription;
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

/** Una estación HYROX: trabajo funcional contra el reloj (lo que se mide es el
 *  tiempo que tardas en cubrir la distancia / las repes de la estación). */
function funcionalDistancia(meters: number): Prescription {
  return { scheme: 'for_time', modality: 'functional', sets: [{ measure: { kind: 'distance', meters } }], target: A_TOPE };
}

function funcionalReps(value: number): Prescription {
  return { scheme: 'for_time', modality: 'functional', sets: [{ measure: { kind: 'reps', value } }], target: A_TOPE };
}

/** Medida oficial de una estación HYROX — SIEMPRE desde la fuente única
 *  (shared/domain/hyrox/stations), nunca un número suelto en este fichero. */
function estacionMetros(slug: HyroxStationSlug): number {
  const m = resolveHyroxStationBySlug(slug)?.measure;
  if (!m || m.kind !== 'distance') throw new Error(`estación sin medida de distancia: ${slug}`);
  return m.meters;
}
function estacionReps(slug: HyroxStationSlug): number {
  const m = resolveHyroxStationBySlug(slug)?.measure;
  if (!m || m.kind !== 'reps') throw new Error(`estación sin medida de repeticiones: ${slug}`);
  return m.value;
}

/** Una ventana de tiempo a tope: fijas el reloj, se mide lo acumulado (metros en
 *  un ergo, repeticiones en un movimiento funcional). `restS` es el descanso que
 *  va DETRÁS de esa ventana, 0 cuando se encadena con la siguiente. */
function ventana(
  modality: TestModality | 'functional',
  seconds: number,
  restS: number,
): Prescription {
  return {
    scheme: 'steady',
    modality,
    sets: [{ measure: { kind: 'duration', seconds }, ...(restS > 0 ? { rest_s: restS } : {}) }],
    target: A_TOPE,
  };
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

  // ── ERGO — la curva estándar de Concept2 ─────────────────────────────────
  { id: 'Remo 500 m', family: 'ergo', label: 'Remo 500 m', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['row'], exerciseLabel: 'Remo', prescription: distancia('row', 500) },
  { id: 'Remo 1 km', family: 'ergo', label: 'Remo 1 km', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['row'], exerciseLabel: 'Remo', prescription: distancia('row', 1000) },
  { id: 'Remo 2 km', family: 'ergo', label: 'Remo 2 km', hint: 'Se mide el tiempo · calibra tus zonas de remo',
    exercise: ['row'], exerciseLabel: 'Remo', prescription: distancia('row', 2000) },
  { id: 'Remo 5 km', family: 'ergo', label: 'Remo 5 km', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['row'], exerciseLabel: 'Remo', prescription: distancia('row', 5000) },
  { id: 'Ski 500 m', family: 'ergo', label: 'Ski 500 m', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['ski', 'ski-erg', 'skierg'], exerciseLabel: 'SkiErg', prescription: distancia('ski', 500) },
  { id: 'Ski 1 km', family: 'ergo', label: 'Ski 1 km', hint: 'Se mide el tiempo · calibra tus zonas de ski',
    exercise: ['ski', 'ski-erg', 'skierg'], exerciseLabel: 'SkiErg', prescription: distancia('ski', 1000) },
  { id: 'Bici 20 min', family: 'ergo', label: 'Bici 20 min', hint: 'Se mide la distancia · se guarda como marca',
    exercise: ['bike', 'bike-erg', 'assault-bike'], exerciseLabel: 'Bici', prescription: tiempo('bike', 1200) },

  // ── CORRER — la curva estándar ritmo-duración ────────────────────────────
  { id: '400 m', family: 'correr', label: '400 m', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: distancia('run', 400) },
  { id: '1 km', family: 'correr', label: '1 km', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: distancia('run', 1000) },
  { id: '1 milla', family: 'correr', label: '1 milla', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: distancia('run', 1609) },
  { id: '3 km', family: 'correr', label: '3 km', hint: 'Se mide el tiempo · se guarda como marca',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: distancia('run', 3000) },
  { id: '5 km', family: 'correr', label: '5 km', hint: 'Se mide el tiempo · calibra tus zonas de carrera',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: distancia('run', 5000) },
  { id: 'Cooper · 12 min', family: 'correr', label: 'Cooper · 12 min', hint: 'Se mide la distancia · se guarda como marca',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: tiempo('run', 720) },
  { id: 'Umbral · 30 min', family: 'correr', label: 'Umbral · 30 min', hint: 'Se mide la distancia · se guarda como marca',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: tiempo('run', 1800) },

  // ── ESTACIONES HYROX — distancias oficiales del rulebook 26/27 ───────────
  // Ojo: la estación 1 de HYROX ES el protocolo anclado del ski (1000 m), así que
  // esta sí recalibra zonas. Lo dice, en vez de dejar que el coach lo suponga.
  { id: 'Ski 1000 m · estación', family: 'estaciones', label: 'SkiErg 1000 m', hint: 'Se mide el tiempo · calibra tus zonas de ski',
    exercise: ['ski', 'ski-erg', 'skierg'], exerciseLabel: 'SkiErg', prescription: distancia('ski', estacionMetros('ski-erg')) },
  { id: 'Sled push 50 m', family: 'estaciones', label: 'Sled push 50 m', hint: 'Se mide el tiempo · estación 2 (4×12,5 m)',
    exercise: ['hyrox-sled-push', 'sled-push'], exerciseLabel: 'Sled Push', prescription: funcionalDistancia(estacionMetros('hyrox-sled-push')) },
  { id: 'Sled pull 50 m', family: 'estaciones', label: 'Sled pull 50 m', hint: 'Se mide el tiempo · estación 3',
    exercise: ['hyrox-sled-pull'], exerciseLabel: 'Sled Pull', prescription: funcionalDistancia(estacionMetros('hyrox-sled-pull')) },
  { id: 'Burpees salto 80 m', family: 'estaciones', label: 'Burpees salto 80 m', hint: 'Se mide el tiempo · estación 4',
    exercise: ['hyrox-burpee-broad-jump'], exerciseLabel: 'Burpee Broad Jump', prescription: funcionalDistancia(estacionMetros('hyrox-burpee-broad-jump')) },
  { id: 'Remo 1000 m · estación', family: 'estaciones', label: 'Remo 1000 m', hint: 'Se mide el tiempo · estación 5',
    exercise: ['row'], exerciseLabel: 'Remo', prescription: distancia('row', estacionMetros('row')) },
  { id: 'Farmers carry 200 m', family: 'estaciones', label: 'Farmers carry 200 m', hint: 'Se mide el tiempo · estación 6',
    exercise: ['hyrox-farmer-carry', 'farmers-carry'], exerciseLabel: 'Farmers Carry', prescription: funcionalDistancia(estacionMetros('hyrox-farmer-carry')) },
  { id: 'Zancadas sandbag 100 m', family: 'estaciones', label: 'Zancadas sandbag 100 m', hint: 'Se mide el tiempo · estación 7',
    exercise: ['hyrox-sandbag-lunges'], exerciseLabel: 'Sandbag Lunges', prescription: funcionalDistancia(estacionMetros('hyrox-sandbag-lunges')) },
  { id: '100 wall balls', family: 'estaciones', label: '100 wall balls', hint: 'Se mide el tiempo · estación 8',
    exercise: ['hyrox-wall-balls', 'wall-balls'], exerciseLabel: 'Wall Balls', prescription: funcionalReps(estacionReps('hyrox-wall-balls')) },

  // ── SIMULACIÓN ───────────────────────────────────────────────────────────
  // HYROX Conditioning Test — el benchmark estandarizado del deporte. Protocolo
  // VERIFICADO contra dos fuentes que cuadran: el desglose estación a estación
  // (Output Sports) suma 8+2 + 4+4+2 + 8+2 + 4 = 34:00 EXACTOS, que es la
  // duración que declara la otra (Sustain Health). El 5 km NO va dentro del
  // test: se aporta aparte como la mejor marca reciente, así que aquí no se
  // monta — meterlo sería falsear el protocolo.
  {
    id: 'HYROX Conditioning Test',
    family: 'simulacion',
    label: 'HYROX Conditioning Test',
    hint: '34 min · 5 estaciones a tope · el benchmark del deporte',
    exercise: ['row'],
    exerciseLabel: 'Remo',
    prescription: ventana('row', 480, 120),
    note: 'Protocolo HCT (34 min): 8 min de remo a tope · 2 min de descanso · 4 min de burpees con salto · 4 min de zancadas sin peso · 2 min de descanso · 8 min de ski a tope · 2 min de descanso · 4 min de wall balls. En los ergos cuentan los metros; en el resto, las repeticiones. Tu mejor 5 km reciente se aporta aparte.',
    stations: [
      { label: '8 min remo', exercise: ['row'], exerciseLabel: 'Remo', prescription: ventana('row', 480, 120) },
      { label: '4 min burpees con salto', exercise: ['hyrox-burpee-broad-jump'], exerciseLabel: 'Burpee Broad Jump', prescription: ventana('functional', 240, 0) },
      { label: '4 min zancadas', exercise: ['reverse-lunge'], exerciseLabel: 'Reverse Lunge', prescription: ventana('functional', 240, 120) },
      { label: '8 min ski', exercise: ['ski', 'ski-erg', 'skierg'], exerciseLabel: 'SkiErg', prescription: ventana('ski', 480, 120) },
      { label: '4 min wall balls', exercise: ['hyrox-wall-balls', 'wall-balls'], exerciseLabel: 'Wall Balls', prescription: ventana('functional', 240, 0) },
    ],
  },
  { id: 'HYROX completo', family: 'simulacion', label: 'HYROX completo', hint: '8 carreras + 8 estaciones · se mide el tiempo',
    exercise: ['run'], exerciseLabel: 'Correr', prescription: distancia('run', 1000), hyrox: 'full' },
  // HYROX half NO está a propósito: `createHyroxSimBlock` solo monta la carrera
  // completa (8+8) y no acepta variante, así que ofrecer «half» pintaría una
  // etiqueta que el contenido no cumple. Se añade cuando la plantilla lo sepa.
];

export const TEST_PRESETS_BY_FAMILY: Record<TestFamily, readonly TestPreset[]> = {
  fuerza: TEST_PRESETS.filter((p) => p.family === 'fuerza'),
  ergo: TEST_PRESETS.filter((p) => p.family === 'ergo'),
  correr: TEST_PRESETS.filter((p) => p.family === 'correr'),
  estaciones: TEST_PRESETS.filter((p) => p.family === 'estaciones'),
  simulacion: TEST_PRESETS.filter((p) => p.family === 'simulacion'),
};
