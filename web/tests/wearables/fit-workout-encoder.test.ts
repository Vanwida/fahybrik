// El codificador .FIT de workout, verificado contra BYTES reales.
//
// Las aserciones van por dos vías a propósito:
//   (1) el DECODIFICADOR oficial de Garmin lee el fichero que acabamos de escribir
//       — si el reloj no lo entendiese, el decodificador tampoco;
//   (2) el búfer crudo, para fijar la cabecera, el orden little-endian y las
//       escalas (ms, cm, mm/s). Un test que solo comprueba "no peta" no habría
//       cazado un centímetro donde iba un metro.

import { describe, expect, test } from 'vitest';
import { Decoder, Stream } from '@garmin/fitsdk';
import {
  buildWatchWorkout,
  type WatchWorkout,
} from '@fahybrid/shared/domain/wearables/watch-workout';
import type { RunStructure } from '@fahybrid/shared/domain/prescription';
import {
  encodeWorkoutFit,
  toFitSerialNumber,
  FitEncodeError,
  FIT_CONTENT_TYPE,
} from '@/lib/wearables/fit/workout-encoder';

// ── Utilidades ───────────────────────────────────────────────────────────────

const FIT_HEADER_SIZE = 14;
const FIT_CRC_SIZE = 2;
const CREATED_AT = new Date('2026-07-25T08:00:00.000Z');

function decode(bytes: Uint8Array) {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  expect(decoder.isFIT()).toBe(true);
  // checkIntegrity valida las DOS sumas de control (la de la cabecera y la del
  // fichero) más el tamaño declarado. Es la prueba de que los CRC están bien.
  expect(decoder.checkIntegrity()).toBe(true);
  const { messages, errors } = decoder.read();
  expect(errors).toEqual([]);
  return messages;
}

/** ¿Aparece `value` codificado como uint32 little-endian en algún punto del fichero? */
function containsLeUint32(bytes: Uint8Array, value: number): boolean {
  const needle = [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (needle.every((b, k) => bytes[i + k] === b)) return true;
  }
  return false;
}

// ── Caso 1 · series ──────────────────────────────────────────────────────────
// 10' calentamiento + 6×(400 m a 3:20-3:30/km + 200 m trote) + 10' vuelta.

const SERIES_STRUCTURE: RunStructure = [
  { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: null }] },
  {
    role: 'main',
    elements: [
      {
        times: 6,
        elements: [
          {
            kind: 'work',
            measure: { type: 'distance', m: 400 },
            target: { type: 'pace', min_s: 200, max_s: 210 },
          },
          {
            kind: 'recovery',
            measure: { type: 'distance', m: 200 },
            target: null,
            recovery_mode: 'trote',
          },
        ],
      },
    ],
  },
  { role: 'cooldown', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: null }] },
];

describe('encodeWorkoutFit · series 6×400', () => {
  const workout = buildWatchWorkout(SERIES_STRUCTURE, {}, { name: 'Series 6×400' });
  const bytes = encodeWorkoutFit(workout, { createdAt: CREATED_AT, serialNumber: 4242 });
  const messages = decode(bytes);

  test('la cabecera es la de 14 bytes con la firma .FIT y el tamaño cuadra', () => {
    expect(bytes[0]).toBe(FIT_HEADER_SIZE);
    expect(bytes[1]).toBe(2); // versión de protocolo
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('.FIT');
    // data_size (bytes 4..7, LE) cuenta SOLO los registros: cabecera y CRC aparte.
    const dataSize =
      bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24);
    expect(dataSize).toBe(bytes.length - FIT_HEADER_SIZE - FIT_CRC_SIZE);
  });

  test('el file_id lo marca como WORKOUT (sin eso un Garmin no lo reconoce)', () => {
    const [fileId] = messages.fileIdMesgs ?? [];
    expect(fileId?.type).toBe('workout');
    expect(fileId?.manufacturer).toBe('development');
    expect(fileId?.serialNumber).toBe(4242);
    expect(new Date(fileId?.timeCreated as string).toISOString()).toBe(CREATED_AT.toISOString());
  });

  test('num_valid_steps cuenta también el paso de repetición', () => {
    const [wkt] = messages.workoutMesgs ?? [];
    expect(wkt?.sport).toBe('running');
    expect(wkt?.wktName).toBe('Series 6×400');
    // calentamiento + 400 m + 200 m + repetición + vuelta a la calma = 5
    expect(wkt?.numValidSteps).toBe(5);
    expect(messages.workoutStepMesgs).toHaveLength(5);
  });

  test('el tiempo va en MILISEGUNDOS y la distancia en CENTÍMETROS', () => {
    const steps = messages.workoutStepMesgs ?? [];
    // 600 s → 600 000 ms crudos, que el perfil vuelve a leer como 600 s.
    expect(steps[0]?.durationType).toBe('time');
    expect(steps[0]?.durationValue).toBe(600_000);
    expect(steps[0]?.durationTime).toBe(600);
    // 400 m → 40 000 cm crudos.
    expect(steps[1]?.durationType).toBe('distance');
    expect(steps[1]?.durationValue).toBe(40_000);
    expect(steps[1]?.durationDistance).toBe(400);
    expect(steps[2]?.durationValue).toBe(20_000);
    expect(steps[2]?.durationDistance).toBe(200);
    // Y esos crudos están LITERALMENTE en el búfer, en little-endian.
    expect(containsLeUint32(bytes, 600_000)).toBe(true);
    expect(containsLeUint32(bytes, 40_000)).toBe(true);
  });

  test('el ritmo se emite como VELOCIDAD y la banda no se invierte', () => {
    const step = (messages.workoutStepMesgs ?? [])[1];
    expect(step?.targetType).toBe('speed');
    // targetValue 0 = rango personalizado, nunca una zona del propio reloj.
    expect(step?.targetValue).toBe(0);
    // 3:20/km = 200 s/km → 1 000 000 / 200 = 5000 mm/s (el ritmo MÁS RÁPIDO es el
    // extremo ALTO de la velocidad).
    expect(step?.customTargetValueHigh).toBe(5000);
    // 3:30/km = 210 s/km → round(1 000 000 / 210) = 4762 mm/s.
    expect(step?.customTargetValueLow).toBe(4762);
    expect(step?.customTargetValueLow).toBeLessThan(step?.customTargetValueHigh as number);
    // El decodificador aplica la escala 1000 y devuelve m/s.
    expect(step?.customTargetSpeedHigh).toBe(5);
    expect(step?.customTargetSpeedLow).toBe(4.762);
    expect(containsLeUint32(bytes, 5000)).toBe(true);
    expect(containsLeUint32(bytes, 4762)).toBe(true);
  });

  test('la repetición apunta al primer paso del bloque y lleva las 6 vueltas', () => {
    const repeat = (messages.workoutStepMesgs ?? [])[3];
    expect(repeat?.durationType).toBe('repeatUntilStepsCmplt');
    // El bloque empieza en el índice 1 (el 0 es el calentamiento).
    expect(repeat?.durationValue).toBe(1);
    expect(repeat?.durationStep).toBe(1);
    expect(repeat?.targetType).toBe('open');
    expect(repeat?.targetValue).toBe(6);
    expect(repeat?.repeatSteps).toBe(6);
    // El perfil dice que nombre e intensidad no aplican a este tipo de duración.
    expect(repeat?.wktStepName).toBeUndefined();
    expect(repeat?.intensity).toBeUndefined();
  });

  test('las intensidades distinguen calentamiento, trabajo, recuperación y vuelta', () => {
    const steps = messages.workoutStepMesgs ?? [];
    expect(steps.map((s) => s.intensity)).toEqual([
      'warmup',
      'active',
      'rest',
      undefined, // el paso de repetición
      'cooldown',
    ]);
  });

  test('el nombre del paso conserva lo que el objetivo no puede expresar', () => {
    const steps = messages.workoutStepMesgs ?? [];
    expect(steps[0]?.wktStepName).toBe("10'");
    expect(steps[1]?.wktStepName).toBe('400 m · 3:20-3:30/km');
    // "trote" es el modo de recuperación: ningún objetivo de reloj lo representa.
    expect(steps[2]?.wktStepName).toBe('200 m · trote');
  });
});

// ── Caso 2 · rodaje continuo por tiempo con banda de pulso ───────────────────

describe('encodeWorkoutFit · rodaje 40′ con banda de pulso', () => {
  // Banda de pulso explícita: así el offset queda fijado en bytes y no depende de
  // la metodología de zonas (que es dato del coach y puede cambiar).
  const workout: WatchWorkout = {
    name: "Rodaje 40'",
    sport: 'running',
    blocks: [
      {
        iterations: 1,
        steps: [
          {
            kind: 'work',
            measure: { type: 'duration', s: 2400 },
            target: { type: 'hr', min_bpm: 140, max_bpm: 155 },
            name: "40' · 140-155 ppm",
          },
        ],
      },
    ],
  };
  const bytes = encodeWorkoutFit(workout, { createdAt: CREATED_AT });
  const messages = decode(bytes);

  test('un solo paso, medido en tiempo, sin repetición', () => {
    expect(messages.workoutMesgs?.[0]?.numValidSteps).toBe(1);
    const step = messages.workoutStepMesgs?.[0];
    expect(step?.durationType).toBe('time');
    expect(step?.durationValue).toBe(2_400_000);
    expect(step?.durationTime).toBe(2400);
    expect(step?.intensity).toBe('active');
  });

  test('el pulso ABSOLUTO va desplazado +100 (FIT reserva 0..100 para el %)', () => {
    const step = messages.workoutStepMesgs?.[0];
    expect(step?.targetType).toBe('heartRate');
    expect(step?.targetValue).toBe(0);
    expect(step?.customTargetValueLow).toBe(240); // 140 ppm + 100
    expect(step?.customTargetValueHigh).toBe(255); // 155 ppm + 100
    // Fuera del rango reservado a los porcentajes: si no, el reloj leería "140 %".
    expect(step?.customTargetValueLow).toBeGreaterThan(100);
    expect(containsLeUint32(bytes, 240)).toBe(true);
    expect(containsLeUint32(bytes, 255)).toBe(true);
  });
});

// ── Degradaciones honestas y validación ──────────────────────────────────────

describe('encodeWorkoutFit · bordes', () => {
  const openStep = {
    kind: 'work' as const,
    measure: { type: 'open' as const },
    target: null,
    name: 'libre',
  };

  test('un tramo abierto se emite como open, no como tiempo cero', () => {
    const bytes = encodeWorkoutFit(
      { name: 'Libre', sport: 'running', blocks: [{ iterations: 1, steps: [openStep] }] },
      { createdAt: CREATED_AT },
    );
    const step = decode(bytes).workoutStepMesgs?.[0];
    expect(step?.durationType).toBe('open');
    expect(step?.targetType).toBe('open');
  });

  test('una banda de ritmo invertida se ordena en vez de emitirse al revés', () => {
    const bytes = encodeWorkoutFit(
      {
        name: 'Invertida',
        sport: 'running',
        blocks: [
          {
            iterations: 1,
            steps: [
              {
                kind: 'work',
                measure: { type: 'distance', m: 1000 },
                // fast/slow al revés de lo que dice el contrato: no debe salir mal.
                target: { type: 'pace', fast_s_per_km: 300, slow_s_per_km: 240 },
                name: '1 km',
              },
            ],
          },
        ],
      },
      { createdAt: CREATED_AT },
    );
    const step = decode(bytes).workoutStepMesgs?.[0];
    expect(step?.customTargetValueLow).toBeLessThan(step?.customTargetValueHigh as number);
  });

  test('un bloque vacío con repetición no emite un bucle infinito', () => {
    const bytes = encodeWorkoutFit(
      {
        name: 'Con hueco',
        sport: 'running',
        blocks: [
          { iterations: 8, steps: [] },
          { iterations: 1, steps: [openStep] },
        ],
      },
      { createdAt: CREATED_AT },
    );
    const steps = decode(bytes).workoutStepMesgs ?? [];
    expect(steps).toHaveLength(1);
    expect(steps.every((s) => s.durationType !== 'repeatUntilStepsCmplt')).toBe(true);
  });

  test('un entreno sin pasos falla en vez de entregar un fichero vacío', () => {
    expect(() =>
      encodeWorkoutFit({ name: 'Vacío', sport: 'running', blocks: [] }),
    ).toThrow(FitEncodeError);
  });

  test('una distancia no positiva falla en vez de perder el tramo en silencio', () => {
    expect(() =>
      encodeWorkoutFit({
        name: 'Corrupto',
        sport: 'running',
        blocks: [
          {
            iterations: 1,
            steps: [
              { kind: 'work', measure: { type: 'distance', m: 0 }, target: null, name: 'x' },
            ],
          },
        ],
      }),
    ).toThrow(FitEncodeError);
  });
});

describe('toFitSerialNumber', () => {
  test('siempre cae dentro del uint32z válido (1..2³²-1)', () => {
    for (const id of [BigInt(1), BigInt(0), BigInt('99999999999999999'), -7]) {
      const serial = toFitSerialNumber(id);
      expect(Number.isInteger(serial)).toBe(true);
      expect(serial).toBeGreaterThanOrEqual(1);
      expect(serial).toBeLessThanOrEqual(0xffffffff);
    }
  });

  test('el mismo id da siempre el mismo serial (descarga idempotente)', () => {
    expect(toFitSerialNumber(BigInt(3457))).toBe(toFitSerialNumber(BigInt(3457)));
  });
});

test('el tipo MIME es el registrado para FIT', () => {
  expect(FIT_CONTENT_TYPE).toBe('application/vnd.ant.fit');
});
