// Codificador .FIT de WORKOUT — `WatchWorkout` → el fichero que el reproductor
// NATIVO de Garmin sabe reproducir (la app Connect IQ solo lo descarga y lo lanza).
//
// POR QUÉ EL SDK OFICIAL Y NO UN ENCODER A MANO
// ---------------------------------------------
// `@garmin/fitsdk` (el binding JavaScript oficial de Garmin) trae `Encoder` desde
// la 21.161.0 — la creencia de que el SDK JS es solo de LECTURA está desfasada.
// Usarlo nos ahorra reimplementar tres cosas donde un fallo silencioso es caro:
// la cabecera de 14 bytes, el CRC-16 (tabla de nibbles de Garmin) y, sobre todo,
// las DEFINICIONES de mensaje (tipos base, endianness, tamaños). El perfil viene
// generado por Garmin, así que las escalas y los tipos base no pueden divergir de
// la especificación. Escribirlo a mano solo se justificaría si el paquete no
// funcionase en Node/serverless: es ESM puro sin binarios nativos ni dependencias,
// así que funciona tal cual en el runtime `nodejs` de Next.
//
// LO QUE EL SDK **NO** HACE POR NOSOTROS
// --------------------------------------
// Las escalas de subcampo (ms, cm, mm/s) y el offset +100 del pulso NO se aplican
// solos: son convención semántica del perfil, no un `offset` que el encoder
// resuelva. Los campos crudos (`durationValue`, `customTargetValueLow/High`) se
// escriben YA convertidos. Cada conversión de abajo lleva su porqué.
//
// FUENTES (verificadas contra el perfil 21.208.0 instalado, no de memoria)
//   · https://developer.garmin.com/fit/cookbook/encoding-workout-files/
//   · https://developer.garmin.com/fit/file-types/workout/
//   · Profile.types / Profile.messages de @garmin/fitsdk 21.208.0

import { Encoder } from '@garmin/fitsdk';
import type {
  Encodable,
  FileIdMesg,
  WorkoutMesg,
  WorkoutStepMesg,
} from '@garmin/fitsdk';
import type {
  WatchBlock,
  WatchStep,
  WatchTarget,
  WatchWorkout,
} from '@fahybrid/shared/domain/wearables/watch-workout';

// ── Números de mensaje globales (Profile.MesgNum) ────────────────────────────
const MESG_NUM_FILE_ID = 0;
const MESG_NUM_WORKOUT = 26;
const MESG_NUM_WORKOUT_STEP = 27;

// ── Enumerados del perfil (valores numéricos, que son el contrato real) ───────
// Se usan los NÚMEROS y no los nombres camelCase del SDK a propósito: el número
// es lo que viaja en el fichero y lo que fija la especificación; el nombre es un
// detalle de la librería que podría renombrarse.

/** `file` — 5 = workout. Sin esto un Garmin no reconoce el fichero como entreno. */
const FILE_TYPE_WORKOUT = 5;
/** `manufacturer` — 255 = development. No somos un fabricante registrado en ANT+. */
const MANUFACTURER_DEVELOPMENT = 255;
/** `product` — 0: no publicamos un id de producto propio. */
const PRODUCT_UNSPECIFIED = 0;
/** `sport` — 1 = running. `WatchWorkout.sport` solo admite 'running'. */
const SPORT_RUNNING = 1;

/** `wkt_step_duration` — cómo se mide el paso. */
const DURATION_TYPE_TIME = 0;
const DURATION_TYPE_DISTANCE = 1;
const DURATION_TYPE_OPEN = 5;
const DURATION_TYPE_REPEAT_UNTIL_STEPS_CMPLT = 6;

/** `wkt_step_target` — contra qué vigila el reloj. */
const TARGET_TYPE_SPEED = 0;
const TARGET_TYPE_HEART_RATE = 1;
const TARGET_TYPE_OPEN = 2;

/** `intensity` — cómo pinta el reloj el paso. */
const INTENSITY_ACTIVE = 0;
const INTENSITY_REST = 1;
const INTENSITY_WARMUP = 2;
const INTENSITY_COOLDOWN = 3;

/**
 * `target_value` = 0 significa "rango PERSONALIZADO" (en vez de un número de zona
 * del reloj). Es exactamente lo que queremos: una zona del reloj sería LA SUYA,
 * derivada de una FCmáx que no es la que nosotros calculamos. Siempre banda
 * absoluta, nunca zona — es la regla de honestidad de `watch-workout.ts`.
 */
const TARGET_VALUE_CUSTOM_RANGE = 0;

/** Un paso sin duración medible (`open`) sigue necesitando el campo: va a 0. */
const DURATION_VALUE_NONE = 0;

// ── Escalas y offsets del perfil ─────────────────────────────────────────────
// Convención FIT: valor_real = crudo / scale. Todos con offset 0 salvo el pulso.

/** `duration_time`: scale 1000 sobre segundos ⇒ el crudo va en MILISEGUNDOS. */
const DURATION_TIME_SCALE = 1000;
/** `duration_distance`: scale 100 sobre metros ⇒ el crudo va en CENTÍMETROS. */
const DURATION_DISTANCE_SCALE = 100;
/** `custom_target_speed_*`: scale 1000 sobre m/s ⇒ el crudo va en MILÍMETROS/s. */
const SPEED_SCALE = 1000;
/** Metros de un kilómetro: el puente entre nuestro ritmo (s/km) y la velocidad. */
const METERS_PER_KM = 1000;
/**
 * FIT reserva el rango 0..100 de los campos de pulso para valores RELATIVOS
 * (% de FCmáx), así que un pulso ABSOLUTO se codifica desplazado +100 ppm:
 * 125 ppm → 225. (En potencia el offset es 1000, no 100 — aquí no aplica.)
 */
const HR_ABSOLUTE_OFFSET_BPM = 100;

// ── Límites ──────────────────────────────────────────────────────────────────

/**
 * Rango fisiológico admisible para una banda de pulso. No es una preferencia:
 * fuera de aquí el dato está corrupto y emitirlo haría que el reloj pitase sin
 * parar. Se recorta a la banda en vez de inventar otra.
 */
const HR_FLOOR_BPM = 30;
const HR_CEILING_BPM = 250;

/**
 * Un campo FIT admite 255 bytes como máximo y una cadena incluye su NUL final,
 * así que quedan 254 útiles. El modelo neutro ya recorta a 40 CARACTERES, pero
 * validamos en BYTES porque en UTF-8 un acento ocupa 2 (y el copy va en español).
 */
const FIT_STRING_MAX_BYTES = 254;

/** `num_valid_steps` es uint16. */
const MAX_WORKOUT_STEPS = 65535;

/** `serial_number` es uint32z: el 0 es el valor inválido, así que el rango es 1..2³²-1. */
const SERIAL_NUMBER_MAX = 0xffffffff;

/** Tipo MIME registrado de un fichero FIT. Es el que espera Connect IQ al descargar. */
export const FIT_CONTENT_TYPE = 'application/vnd.ant.fit';

/** Error de codificación: el entreno de origen no puede producir un fichero válido. */
export class FitEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitEncodeError';
  }
}

// ── Conversiones ─────────────────────────────────────────────────────────────

function assertPositiveFinite(value: number, what: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new FitEncodeError(`${what} debe ser un número positivo (recibido: ${value})`);
  }
  return value;
}

/**
 * Ritmo (s/km) → velocidad cruda FIT (mm/s).
 *   v [m/s] = 1000 m / ritmo_s   ⇒   crudo = v · 1000 = 1_000_000 / ritmo_s
 */
function paceToRawSpeed(paceSPerKm: number): number {
  return Math.round((METERS_PER_KM * SPEED_SCALE) / paceSPerKm);
}

/** Pulso en ppm → crudo FIT (ppm + 100), recortado al rango fisiológico. */
function bpmToRawHeartRate(bpm: number): number {
  const clamped = Math.min(HR_CEILING_BPM, Math.max(HR_FLOOR_BPM, Math.round(bpm)));
  return clamped + HR_ABSOLUTE_OFFSET_BPM;
}

/**
 * Recorta una cadena al máximo de bytes de un campo FIT sin partir un carácter
 * multibyte por la mitad (cortar por bytes a pelo produciría UTF-8 inválido).
 */
function clampFitString(raw: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(raw).length <= FIT_STRING_MAX_BYTES) return raw;
  let out = raw;
  while (out.length > 0 && encoder.encode(out).length > FIT_STRING_MAX_BYTES) {
    out = out.slice(0, -1);
  }
  return out;
}

// ── Mensaje de paso ──────────────────────────────────────────────────────────

interface StepDuration {
  durationType: number;
  durationValue: number;
}

function toStepDuration(step: WatchStep): StepDuration {
  switch (step.measure.type) {
    case 'distance':
      return {
        durationType: DURATION_TYPE_DISTANCE,
        durationValue: Math.round(
          assertPositiveFinite(step.measure.m, 'La distancia del paso') * DURATION_DISTANCE_SCALE,
        ),
      };
    case 'duration':
      return {
        durationType: DURATION_TYPE_TIME,
        durationValue: Math.round(
          assertPositiveFinite(step.measure.s, 'La duración del paso') * DURATION_TIME_SCALE,
        ),
      };
    case 'open':
      // Vuelta manual: el paso corre hasta que el atleta pulsa lap.
      return { durationType: DURATION_TYPE_OPEN, durationValue: DURATION_VALUE_NONE };
  }
}

interface StepTarget {
  targetType: number;
  targetValue: number;
  customTargetValueLow?: number;
  customTargetValueHigh?: number;
}

const OPEN_TARGET: StepTarget = { targetType: TARGET_TYPE_OPEN, targetValue: TARGET_VALUE_CUSTOM_RANGE };

/**
 * Objetivo del modelo neutro → objetivo FIT. Un objetivo que no se puede convertir
 * a una banda utilizable degrada a ABIERTO en vez de emitir números inventados: el
 * dato sigue vivo en el nombre del paso, que es texto para el atleta y no finge ser
 * una medición (la regla de honestidad de `watch-workout.ts`).
 *
 * FIT admite UN objetivo por paso, así que la cadencia y la inclinación que trae el
 * `WatchStep` no se emiten como segundo objetivo: ya vienen incorporadas al nombre.
 */
function toStepTarget(target: WatchTarget): StepTarget {
  if (!target) return OPEN_TARGET;

  if (target.type === 'pace') {
    const { fast_s_per_km, slow_s_per_km } = target;
    if (
      !Number.isFinite(fast_s_per_km) ||
      !Number.isFinite(slow_s_per_km) ||
      fast_s_per_km <= 0 ||
      slow_s_per_km <= 0
    ) {
      return OPEN_TARGET;
    }
    // Un ritmo MÁS RÁPIDO (menos s/km) es una velocidad MÁS ALTA, así que el
    // extremo "fast" de la banda de ritmo es el ALTO de la banda de velocidad. Se
    // ordena con min/max sobre los dos valores YA convertidos: así una banda que
    // llegase invertida no se emite al revés (validamos, no confiamos).
    const a = paceToRawSpeed(fast_s_per_km);
    const b = paceToRawSpeed(slow_s_per_km);
    return {
      targetType: TARGET_TYPE_SPEED,
      targetValue: TARGET_VALUE_CUSTOM_RANGE,
      customTargetValueLow: Math.min(a, b),
      customTargetValueHigh: Math.max(a, b),
    };
  }

  const { min_bpm, max_bpm } = target;
  if (!Number.isFinite(min_bpm) || !Number.isFinite(max_bpm)) return OPEN_TARGET;
  const low = bpmToRawHeartRate(min_bpm);
  const high = bpmToRawHeartRate(max_bpm);
  return {
    targetType: TARGET_TYPE_HEART_RATE,
    targetValue: TARGET_VALUE_CUSTOM_RANGE,
    customTargetValueLow: Math.min(low, high),
    customTargetValueHigh: Math.max(low, high),
  };
}

type StepMesg = Encodable<WorkoutStepMesg>;

/** Un paso normal (calentamiento, trabajo, recuperación, vuelta a la calma). */
function toStepMesg(messageIndex: number, step: WatchStep, intensity: number): StepMesg {
  return {
    mesgNum: MESG_NUM_WORKOUT_STEP,
    messageIndex,
    wktStepName: clampFitString(step.name),
    ...toStepDuration(step),
    ...toStepTarget(step.target),
    intensity,
  };
}

/**
 * Paso de REPETICIÓN. Va justo DESPUÉS del bloque que repite:
 *   · `duration_value` = message_index del PRIMER paso del bloque (a dónde vuelve)
 *   · `target_value`   = nº TOTAL de iteraciones del bloque
 * El perfil documenta que `wkt_step_name` e `intensity` no aplican a este tipo de
 * duración, así que se omiten en vez de rellenarlos con ruido.
 */
function toRepeatStepMesg(
  messageIndex: number,
  repeatFromIndex: number,
  iterations: number,
): StepMesg {
  return {
    mesgNum: MESG_NUM_WORKOUT_STEP,
    messageIndex,
    durationType: DURATION_TYPE_REPEAT_UNTIL_STEPS_CMPLT,
    durationValue: repeatFromIndex,
    targetType: TARGET_TYPE_OPEN,
    targetValue: iterations,
  };
}

// ── Ensamblado de los pasos ──────────────────────────────────────────────────

/**
 * `kind` del modelo neutro → `intensity` de FIT. El calentamiento y la vuelta a la
 * calma usan sus intensidades DEDICADAS (2/3) porque el reloj las pinta y las
 * anuncia distinto; dentro de los bloques, trabajo → active y recuperación → rest,
 * que es lo que hace el propio cookbook de Garmin para una serie de intervalos.
 */
function blockStepIntensity(step: WatchStep): number {
  return step.kind === 'work' ? INTENSITY_ACTIVE : INTENSITY_REST;
}

function appendBlock(steps: StepMesg[], block: WatchBlock): void {
  if (block.steps.length === 0) {
    // Un bloque vacío con repetición produciría un `repeat` que apunta a SÍ MISMO
    // — un bucle infinito en el reloj. Se ignora en vez de emitirlo.
    return;
  }
  const firstIndex = steps.length;
  for (const step of block.steps) {
    steps.push(toStepMesg(steps.length, step, blockStepIntensity(step)));
  }
  const iterations = Math.trunc(block.iterations);
  if (!Number.isFinite(iterations) || iterations <= 1) return;
  steps.push(toRepeatStepMesg(steps.length, firstIndex, iterations));
}

function buildStepMesgs(workout: WatchWorkout): StepMesg[] {
  const steps: StepMesg[] = [];
  if (workout.warmup) steps.push(toStepMesg(0, workout.warmup, INTENSITY_WARMUP));
  for (const block of workout.blocks) appendBlock(steps, block);
  if (workout.cooldown) {
    steps.push(toStepMesg(steps.length, workout.cooldown, INTENSITY_COOLDOWN));
  }
  return steps;
}

// ── API pública ──────────────────────────────────────────────────────────────

export interface EncodeWorkoutFitOptions {
  /** Instante de creación del fichero. Inyectable para que los tests sean deterministas. */
  createdAt?: Date;
  /**
   * `serial_number` del file_id. La especificación dice que la tupla
   * (type, manufacturer, product, serial_number) identifica el fichero, así que
   * pasar un id ESTABLE (el de la asignación) hace que re-descargar el mismo
   * entreno lo REEMPLACE en el reloj en vez de duplicarlo.
   */
  serialNumber?: number;
}

/** Normaliza cualquier entero al rango uint32z válido (1..2³²-1; el 0 es inválido). */
export function toFitSerialNumber(id: bigint | number): number {
  const n = typeof id === 'bigint' ? id : BigInt(Math.trunc(id));
  const positive = n < BigInt(0) ? -n : n;
  return Number(positive % BigInt(SERIAL_NUMBER_MAX)) + 1;
}

/**
 * Codifica un `WatchWorkout` como fichero .FIT de workout.
 *
 * Lanza `FitEncodeError` cuando el entreno de origen no puede producir un fichero
 * reproducible (sin pasos, o una medida no positiva). Fallar aquí es preferible a
 * entregar al reloj un entreno al que le falta trabajo sin decirlo.
 */
export function encodeWorkoutFit(
  workout: WatchWorkout,
  options: EncodeWorkoutFitOptions = {},
): Uint8Array {
  const steps = buildStepMesgs(workout);
  if (steps.length === 0) {
    throw new FitEncodeError('El entreno no tiene ningún paso que enviar al reloj');
  }
  if (steps.length > MAX_WORKOUT_STEPS) {
    throw new FitEncodeError(
      `El entreno tiene ${steps.length} pasos y FIT admite ${MAX_WORKOUT_STEPS} como máximo`,
    );
  }

  const createdAt = options.createdAt ?? new Date();

  const fileId: Encodable<FileIdMesg> = {
    mesgNum: MESG_NUM_FILE_ID,
    type: FILE_TYPE_WORKOUT,
    manufacturer: MANUFACTURER_DEVELOPMENT,
    product: PRODUCT_UNSPECIFIED,
    serialNumber: options.serialNumber ?? toFitSerialNumber(createdAt.getTime()),
    timeCreated: createdAt,
  };
  const workoutMesg: Encodable<WorkoutMesg> = {
    mesgNum: MESG_NUM_WORKOUT,
    sport: SPORT_RUNNING,
    // Cuenta TODOS los workout_step, incluidos los de repetición.
    numValidSteps: steps.length,
    wktName: clampFitString(workout.name),
  };

  // El orden es normativo: file_id → workout → workout_step[].
  const encoder = new Encoder();
  encoder.writeMesg(fileId);
  encoder.writeMesg(workoutMesg);
  for (const step of steps) encoder.writeMesg(step);

  return encoder.close();
}
