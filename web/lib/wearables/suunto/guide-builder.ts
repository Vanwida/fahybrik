// `WatchWorkout` (modelo neutro, ya resuelto por atleta) → `guide.json` de Suunto.
//
// Aquí viven las TRES conversiones de unidad que la spec de Suunto no hace como
// uno esperaría. Están todas citadas y todas tienen test.
//
// FUENTE: https://apizone.suunto.com/suuntoplus-guide-description (secciones
// "Field Types" y "Condition Types") + el PDF "Suuntoplus Guide Cloud API".

import type {
  WatchBlock,
  WatchCadence,
  WatchMeasure,
  WatchStep,
  WatchTarget,
  WatchWorkout,
} from '@fahybrid/shared/domain/wearables/watch-workout';
import {
  GUIDE_LIMITS,
  guideSchema,
  type GuideField,
  type GuideFieldsStep,
  type GuideStep,
  type GuideTransition,
  type SuuntoGuide,
} from './guide-schema';

// ── Conversiones de unidad ───────────────────────────────────────────────────

const METERS_PER_KM = 1000;
const SECONDS_PER_MINUTE = 60;
/**
 * Suunto cuenta la cadencia de carrera en REVOLUCIONES (una pierna), no en pasos:
 * "Cadence is defined in steps per minute (spm) or revolutions per minute (rpm,
 * counting one leg) […] Suunto uses revolutions per minute" — y sitúa la
 * referencia en "90 rpm (180 spm)"
 * (https://us.suunto.com/blogs/blog/tracking-cadence-heart-rate-and-pace-while-running).
 * Así que un paso de nuestro modelo (spm) vale MEDIA revolución.
 */
const STEPS_PER_REVOLUTION = 2;

/** Decimales al redondear m/s y Hz (los ejemplos oficiales usan 3-4). */
const UNIT_DECIMALS = 3;

function round(value: number): number {
  const factor = 10 ** UNIT_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Ritmo (s/km) → METROS POR SEGUNDO, que es lo que `targetPace` espera: la spec
 * lo dice con todas las letras, "Unit: m/s (not min/km; conversion required)",
 * y su ejemplo de 4.166 m/s es un 4:00/km.
 */
export function paceToMetersPerSecond(secondsPerKm: number): number {
  return round(METERS_PER_KM / secondsPerKm);
}

/**
 * Cadencia (spm) → HERCIOS. El ejemplo oficial rotula min 1.4 / max 1.6 como
 * "84 - 96 RPM" ⇒ Hz = RPM / 60; y RPM = spm / 2 (ver STEPS_PER_REVOLUTION).
 * O sea 180 spm = 90 rpm = 1.5 Hz, que es justo el ejemplo "90 RPM" → 1.5.
 */
export function cadenceToHertz(stepsPerMinute: number): number {
  return round(stepsPerMinute / (STEPS_PER_REVOLUTION * SECONDS_PER_MINUTE));
}

// ── Juego de caracteres del reloj ────────────────────────────────────────────
//
// La spec publica el juego MÍNIMO garantizado y avisa de que lo demás "is ignored
// or replaced". No incluye vocales acentuadas, ni ñ, ni el punto medio "·" que
// usa el nombre de paso del modelo neutro. Sanear no es cosmética: sin esto un
// "400 m · 3:30/km" puede llegar al reloj mutilado.
const CHAR_REPLACEMENTS: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a',
  é: 'e', è: 'e', ë: 'e', ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u',
  ñ: 'n', ç: 'c',
  '·': '-', '–': '-', '—': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '×': 'x',
};

/** Juego mínimo garantizado, verbatim de la sección "Supported Characters". */
const SUPPORTED_CHARS = new Set(
  ' !"#$%&\'()*+,-./0123456789:;<=>?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz|°',
);

export function toWatchCharset(input: string): string {
  let out = '';
  for (const char of input) {
    const mapped = CHAR_REPLACEMENTS[char] ?? CHAR_REPLACEMENTS[char.toLowerCase()];
    if (mapped !== undefined) {
      // Conserva la caja original cuando el reemplazo es de una sola letra.
      out += char === char.toLowerCase() ? mapped : mapped.toUpperCase();
      continue;
    }
    if (SUPPORTED_CHARS.has(char)) out += char;
    // Lo que no está en el juego mínimo se descarta: mejor un hueco que un
    // glifo aleatorio elegido por el firmware.
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Sanea al juego del reloj y recorta al límite del campo, sin partir palabras. */
function watchText(input: string, max: number): string {
  const clean = toWatchCharset(input);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

// ── IDs de deporte ───────────────────────────────────────────────────────────
//
// OJO: el ejemplo del PDF trae `"activities": [3]` diciendo que es Running. NO lo
// es. En la tabla oficial de deportes (Activities.pdf, la que la spec referencia
// desde el campo `activities`) el 3 es CROSS-COUNTRY SKIING; Running es el 1.
// Copiar el ejemplo habría archivado cada guide bajo esquí de fondo, donde el
// atleta no lo encuentra al elegir Running en el reloj.
//
// Mandamos toda la familia de carrera para que el guide aparezca elija el atleta
// el modo que elija: calle, cinta o pista — que es exactamente el reparto de un
// entreno de HYROX.
const ACTIVITY_IDS = {
  running: 1,
  trailRunning: 22,
  treadmill: 53,
  trackAndField: 59,
  trackRunning: 103,
} as const;

const RUNNING_ACTIVITY_IDS = [
  ACTIVITY_IDS.running,
  ACTIVITY_IDS.trailRunning,
  ACTIVITY_IDS.treadmill,
  ACTIVITY_IDS.trackAndField,
  ACTIVITY_IDS.trackRunning,
];

// ── Rótulos cortos (13 caracteres: es un rótulo, no el nombre del tramo) ──────

const STEP_TITLE = {
  warmup: 'Calentamiento', // 13 exactos
  cooldown: 'Vuelta calma',
  recovery: 'Recuperacion',
  work: 'Trabajo',
  done: 'Hecho',
} as const;

function measureTitle(measure: WatchMeasure): string | undefined {
  if (measure.type === 'distance') {
    const { m } = measure;
    return m >= METERS_PER_KM && m % METERS_PER_KM === 0 ? `${m / METERS_PER_KM} km` : `${m} m`;
  }
  if (measure.type === 'duration') {
    const { s } = measure;
    if (s % SECONDS_PER_MINUTE === 0) return `${s / SECONDS_PER_MINUTE} min`;
    const mins = Math.floor(s / SECONDS_PER_MINUTE);
    const secs = s % SECONDS_PER_MINUTE;
    return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs} s`;
  }
  return undefined;
}

type StepRole = 'warmup' | 'cooldown' | 'main';

function stepTitle(step: WatchStep, role: StepRole): string {
  if (role === 'warmup') return STEP_TITLE.warmup;
  if (role === 'cooldown') return STEP_TITLE.cooldown;
  if (step.kind === 'recovery') return STEP_TITLE.recovery;
  return measureTitle(step.measure) ?? STEP_TITLE.work;
}

// ── Paso → campos + avance ───────────────────────────────────────────────────

function targetField(target: WatchTarget): GuideField | undefined {
  if (!target) return undefined;
  if (target.type === 'pace') {
    // INVERSIÓN DELIBERADA: el modelo neutro habla en segundos por km (más
    // segundos = más lento) y Suunto en metros por segundo (más m/s = más
    // rápido). El ritmo RÁPIDO es por tanto el MÁXIMO de la banda en m/s, y el
    // lento el mínimo. Cruzarlos daría una banda invertida que el reloj no puede
    // satisfacer nunca.
    return {
      type: 'targetPace',
      min: paceToMetersPerSecond(target.slow_s_per_km),
      max: paceToMetersPerSecond(target.fast_s_per_km),
    };
  }
  return { type: 'targetHeartRate', min: target.min_bpm, max: target.max_bpm };
}

function cadenceField(cadence: WatchCadence | undefined): GuideField | undefined {
  if (!cadence) return undefined;
  // Suunto SÍ admite un objetivo secundario en el mismo paso (a diferencia de
  // Apple WorkoutKit o FIT, que obligan a volcar la cadencia al nombre).
  return {
    type: 'targetCadence',
    min: cadenceToHertz(cadence.min_spm),
    max: cadenceToHertz(cadence.max_spm),
  };
}

/**
 * Medición COMPLEMENTARIA al objetivo. El campo de objetivo ya pinta su propio
 * medidor con el valor actual, así que repetir la misma magnitud no aporta: si
 * el objetivo es ritmo mostramos pulso, y al revés. Es el mismo criterio que el
 * ejemplo oficial del PDF, que acompaña `targetHeartRate` de otras métricas.
 */
function companionField(target: WatchTarget): GuideField {
  return target?.type === 'pace' ? { type: 'heartRate' } : { type: 'pace' };
}

function countdownField(measure: WatchMeasure): GuideField | undefined {
  if (measure.type === 'duration') return { type: 'stepDurationCountdown', value: measure.s };
  if (measure.type === 'distance') return { type: 'stepDistanceCountdown', value: measure.m };
  return undefined;
}

/**
 * Cómo AVANZA el paso. Un tramo abierto (`open`) no tiene medida que lo cierre:
 * lo cierra el atleta pulsando vuelta, que es justo `manualLap`.
 */
function transitionsFor(measure: WatchMeasure): GuideTransition[] {
  switch (measure.type) {
    case 'distance':
      return [{ condition: { type: 'stepDistance', value: measure.m } }];
    case 'duration':
      return [{ condition: { type: 'stepDuration', value: measure.s } }];
    case 'open':
      return [{ condition: { type: 'manualLap' } }];
  }
}

function toGuideStep(step: WatchStep, role: StepRole): GuideFieldsStep {
  const title = watchText(stepTitle(step, role), GUIDE_LIMITS.STEP_TITLE_MAX);
  // El nombre del modelo neutro YA lleva incorporado lo que el objetivo no puede
  // expresar (RPE, zona sin resolver, inclinación, modo de recuperación): se usa
  // tal cual, sin re-derivar nada.
  const label = watchText(step.name, GUIDE_LIMITS.TEXT_FIELD_SOLO_ABOVE);

  const fields: GuideField[] = [{ type: 'text', value: label }];
  const target = targetField(step.target);
  if (target) fields.push(target);
  const cadence = cadenceField(step.cadence);
  if (cadence) fields.push(cadence);
  fields.push(companionField(step.target));
  const countdown = countdownField(step.measure);
  if (countdown) fields.push(countdown);

  return {
    type: 'fields',
    title,
    // Una vuelta por tramo prescrito: así cada paso del plan sale como un lap en
    // el FIT y la ejecución casa con la prescripción sin heurísticas.
    createManualLap: true,
    fields,
    transitions: transitionsFor(step.measure),
    notification: { title, text: watchText(step.name, GUIDE_LIMITS.NOTIFICATION_TEXT_MAX) },
  };
}

function toGuideSteps(block: WatchBlock): GuideStep[] {
  const steps = block.steps.map((step) => toGuideStep(step, 'main'));
  if (block.iterations <= 1) return steps;
  // Un `repeat` no puede anidar otro `repeat` (spec), pero `WatchBlock` ya llega
  // con un ÚNICO nivel de repetición — el modelo neutro aplana lo de dentro.
  return [{ type: 'repeat', times: block.iterations, steps }];
}

// ── Entrada del constructor ──────────────────────────────────────────────────

export interface BuildSuuntoGuideOpts {
  /** DEBE coincidir con el nombre de la app en los ajustes OAuth (ver config). */
  owner: string;
  /** Enlace de vuelta a la sesión. Obligatorio y con formato URL válido. */
  url: string;
  /** Casa ejecución↔prescripción: vuelve en el FIT. Ver `guideExternalId`. */
  externalId: string;
  /** Fecha planificada, yyyy-MM-dd en hora local del atleta. */
  localDate?: string;
  /** Texto largo para la app del móvil. Por defecto, el resumen de los tramos. */
  description?: string;
}

/**
 * `externalId` derivado de la asignación. Vuelve en el FIT exportado dentro de
 * `suuntoplus_plugin_external_id` (indexado por `suuntoplus_plugin_owner_id`,
 * que es nuestro client_id), así que casar la ejecución con la prescripción es
 * una comparación de igualdad, no una heurística de solapamiento temporal.
 *
 * El prefijo evita colisionar con ids de otros socios en el mismo array.
 */
export function guideExternalId(assignmentId: bigint | number | string): string {
  return `fhb-a${assignmentId}`;
}

/**
 * Resumen legible de los tramos para la ficha del móvil. No va al reloj, así que
 * conserva acentos; solo se recorta al límite del campo.
 */
function summarize(workout: WatchWorkout): string {
  const parts: string[] = [];
  if (workout.warmup) parts.push(workout.warmup.name);
  for (const block of workout.blocks) {
    const inner = block.steps.map((s) => s.name).join(' + ');
    parts.push(block.iterations > 1 ? `${block.iterations}x (${inner})` : inner);
  }
  if (workout.cooldown) parts.push(workout.cooldown.name);
  const joined = parts.filter(Boolean).join(' | ');
  const text = joined.length > 0 ? joined : workout.name;
  return text.length <= GUIDE_LIMITS.DESCRIPTION_MAX
    ? text
    : `${text.slice(0, GUIDE_LIMITS.DESCRIPTION_MAX - 1)}…`;
}

/**
 * Construye el guide.json. Valida contra el esquema antes de devolverlo: un
 * guide inválido se responde con un 400 genérico que no dice qué campo falla,
 * así que es mucho más barato romper aquí, con la ruta del campo delante.
 */
export function buildSuuntoGuide(workout: WatchWorkout, opts: BuildSuuntoGuideOpts): SuuntoGuide {
  const steps: GuideStep[] = [];
  if (workout.warmup) steps.push(toGuideStep(workout.warmup, 'warmup'));
  for (const block of workout.blocks) steps.push(...toGuideSteps(block));
  if (workout.cooldown) steps.push(toGuideStep(workout.cooldown, 'cooldown'));

  // Paso final sin transiciones: cierra la secuencia en una pantalla estable en
  // vez de dejar la última transición apuntando al vacío. El ejemplo oficial del
  // PDF hace lo mismo con su paso "Good Job".
  steps.push({
    type: 'fields',
    title: STEP_TITLE.done,
    fields: [{ type: 'text', value: toWatchCharset('Sesión completada') }],
  });

  const guide: SuuntoGuide = {
    type: 'sequence',
    name: watchText(workout.name, GUIDE_LIMITS.NAME_MAX),
    description: opts.description ?? summarize(workout),
    shortDescription: watchText(workout.name, GUIDE_LIMITS.SHORT_DESCRIPTION_MAX),
    owner: opts.owner,
    url: opts.url,
    activities: RUNNING_ACTIVITY_IDS,
    usage: 'workout',
    externalId: opts.externalId,
    steps,
  };
  if (opts.localDate) guide.localDate = opts.localDate;

  return guideSchema.parse(guide);
}
