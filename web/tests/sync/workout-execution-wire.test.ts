/**
 * Contrato de escritura del único writer (POST /api/sync/workout-execution).
 *
 * Zod no rechaza un campo: rechaza la PETICIÓN. Un valor imposible de aparato
 * o un instante con offset local 400aba el POST entero — error distinto cada
 * día, misma sesión perdida. Desde 2026-09-24 (auditoría app atleta E1) tampoco
 * lo hace un tipo equivocado ni un tramo sin identidad (se cae él solo), y el id
 * de sesión ya no decide si se guarda (`record-athlete-workout.ts`). Lo demás
 * entra y se gatea al persistir.
 *
 * Puro: sin base de datos.
 */
import { expect, test } from 'vitest';
import { workoutExecutionSchema } from '@/lib/sync/record-workout-execution';
import {
  clipText,
  DISTANCE_M_MAX,
  INT4_MAX,
  sanitizeCompleteness,
  sanitizeDeclaredSource,
  sanitizeDurationSeconds,
  sanitizeHrSource,
  sanitizeLegRole,
  sanitizeNonNegative,
  sanitizeNonNegativeInt,
  sanitizeNotes,
  sanitizeNumericColumn,
  sanitizePerceivedExertion,
  sanitizePositiveInt,
  sanitizeSegmentSource,
} from '@/lib/sync/sanitize-measurement';
import { coerceWireInstant, isWireInstant } from '@/lib/sync/wire-instant';

function payload(extra: Record<string, unknown> = {}) {
  return {
    assignment_id: '42',
    started_at: '2026-04-06T08:00:00Z',
    ended_at: '2026-04-06T08:47:00Z',
    total_duration_seconds: 2820,
    segments: [
      {
        position: 0,
        modality: 'run',
        duration_seconds: 362,
        distance_meters: 1000,
        source: 'treadmill',
      },
    ],
    ...extra,
  };
}

function parse(extra: Record<string, unknown> = {}) {
  return workoutExecutionSchema.safeParse(payload(extra));
}

test('un run con instantes Z sigue entrando', () => {
  expect(parse().success).toBe(true);
});

test('un instante con offset local no tumba el envío', () => {
  const parsed = parse({
    started_at: '2026-04-06T10:00:00+02:00',
    ended_at: '2026-04-06T10:47:00+02:00',
  });
  expect(parsed.success).toBe(true);
  expect(isWireInstant('2026-04-06T10:00:00+02:00')).toBe(true);
});

test('fracciones y +0000 sin colon son instantes válidos', () => {
  expect(isWireInstant('2026-04-06T08:00:00.123Z')).toBe(true);
  expect(isWireInstant('2026-04-06T08:00:00+0000')).toBe(true);
  expect(coerceWireInstant('2026-04-06T08:00:00+0000')).toBe('2026-04-06T08:00:00+00:00');
  expect(parse({ started_at: '2026-04-06T08:00:00.123Z' }).success).toBe(true);
  expect(parse({ started_at: '2026-04-06T08:00:00+0000' }).success).toBe(true);
});

test('un instante basura se omite; no 400', () => {
  const parsed = parse({ started_at: 'ayer-por-la-tarde' });
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.started_at).toBeUndefined();
});

test('JSON null en opcionales es ausencia, no 400', () => {
  expect(
    parse({
      template_segment_id: null,
      notes: null,
      source: null,
      perceived_exertion: null,
    }).success,
  ).toBe(true);
  expect(
    parse({
      segments: [
        {
          position: 0,
          modality: 'run',
          template_segment_id: null,
          duration_seconds: 100,
        },
      ],
    }).success,
  ).toBe(true);
});

test('una medida imposible cuesta su campo, no la sesión', () => {
  const parsed = parse({
    total_duration_seconds: 2820.4,
    perceived_exertion: 11,
    segments: [
      {
        position: 0,
        modality: 'run',
        duration_seconds: 2820.4,
        distance_meters: -3,
        calories: -1,
        source: '',
        hr_source: 'watch',
        leg_role: 'work_bout',
        velocity_loss_pct: -8,
        sets: [
          {
            set_index: 1,
            load_actual_kg: null,
            velocity_loss_pct: -8,
          },
        ],
      },
    ],
  });
  expect(parsed.success).toBe(true);
  expect(sanitizeDurationSeconds(2820.4)).toBe(2820);
  expect(sanitizePerceivedExertion(11)).toBeNull();
  expect(sanitizeNonNegative(-3)).toBeNull();
  expect(sanitizeNonNegative(-1)).toBeNull();
  expect(sanitizeSegmentSource('')).toBeNull();
  expect(sanitizeHrSource('watch')).toBeNull();
  expect(sanitizeLegRole('work_bout')).toBeNull();
  expect(sanitizeNonNegative(-8)).toBeNull();
});

test('notes de 4001 caracteres se recortan, no se rechazan', () => {
  const long = 'x'.repeat(4001);
  expect(parse({ notes: long }).success).toBe(true);
  expect(sanitizeNotes(long)?.length).toBe(4000);
  expect(clipText(long, 4000)?.length).toBe(4000);
});

test('source pm5 a nivel ejecución se ignora; gps sigue valiendo', () => {
  expect(parse({ source: 'pm5' }).success).toBe(true);
  expect(sanitizeDeclaredSource('pm5')).toBeUndefined();
  expect(parse({ source: 'gps' }).success).toBe(true);
  expect(sanitizeDeclaredSource('gps')).toBe('gps');
});

test('completeness desconocido se trata como omitido (full)', () => {
  expect(parse({ completeness: 'kinda' }).success).toBe(true);
  expect(sanitizeCompleteness('kinda')).toBeUndefined();
  expect(sanitizeCompleteness('partial')).toBe('partial');
});

test('emom o set_index imposibles no 400; el conteo se anula', () => {
  expect(
    parse({
      segments: [
        {
          position: 0,
          modality: 'other',
          emom_rounds_completed: -1,
          sets: [{ set_index: 0, reps_actual: 5 }],
        },
      ],
    }).success,
  ).toBe(true);
  expect(sanitizeNonNegativeInt(-1)).toBeNull();
});

// La identidad de un TRAMO sigue estricta (segment-input-bands.test.ts lo fija),
// pero ya no se lleva la sesión por delante: el tramo que no la cumple se cae él
// solo y la ruta lo avisa en el servidor (auditoría app atleta E1, 2026-09-24).
test('un tramo sin identidad se cae él solo; la sesión entra', () => {
  const parsed = parse({
    segments: [
      { position: -1, modality: 'run' },
      { position: 0, modality: '' },
      { position: 1, modality: 'run', duration_seconds: 60 },
    ],
  });
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.segments?.map((s) => s.position)).toEqual([1]);
});

test('un campo de evidencia con el tipo equivocado cuesta ese campo, no la sesión', () => {
  const parsed = parse({
    perceived_exertion: 'alto',
    total_duration_seconds: '2820',
    notes: 42,
    started_at: 1_700_000_000,
    completeness: true,
    segments: [
      {
        position: 0,
        modality: 'strength',
        duration_seconds: 'mucho',
        reps_confirmed: 'sí',
        sets: [{ set_index: 1, load_actual_kg: '100' }, { reps_actual: 5 }],
      },
    ],
  });
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(parsed.data.perceived_exertion).toBeUndefined();
  expect(parsed.data.total_duration_seconds).toBeUndefined();
  expect(parsed.data.notes).toBeUndefined();
  expect(parsed.data.started_at).toBeUndefined();
  expect(parsed.data.completeness).toBeUndefined();
  const seg = parsed.data.segments?.[0];
  expect(seg?.duration_seconds).toBeUndefined();
  expect(seg?.reps_confirmed).toBeUndefined();
  // La serie sin índice se cae; la otra entra sin su carga mal tipada.
  expect(seg?.sets).toHaveLength(1);
  expect(seg?.sets?.[0]?.load_actual_kg).toBeUndefined();
});

test('el id de sesión no decide si la sesión se guarda; solo un cuerpo que no es objeto se rechaza', () => {
  expect(workoutExecutionSchema.safeParse({ started_at: '2026-04-06T08:00:00Z' }).success).toBe(true);
  expect(workoutExecutionSchema.safeParse({ assignment_id: null, notes: 'x' }).success).toBe(true);
  expect(workoutExecutionSchema.safeParse(null).success).toBe(false);
  expect(workoutExecutionSchema.safeParse([1, 2]).success).toBe(false);
});

test('un id de bloque o un GPS disparado no 400; no caben en columna → hueco', () => {
  expect(
    parse({
      segments: [
        {
          position: 0,
          modality: 'run',
          template_segment_id: 9_999_999,
          distance_meters: 1e10,
        },
      ],
    }).success,
  ).toBe(true);
  expect(sanitizeNumericColumn(1e10, DISTANCE_M_MAX)).toBeNull();
  expect(sanitizeNumericColumn(1000, DISTANCE_M_MAX)).toBe(1000);
});

test('un entero que no cabe en int4 cuesta el campo, no la sesión', () => {
  expect(parse({ total_duration_seconds: 1e15 }).success).toBe(true);
  expect(sanitizeDurationSeconds(1e15)).toBeNull();
  expect(sanitizeNonNegativeInt(INT4_MAX)).toBe(INT4_MAX);
  expect(sanitizeNonNegativeInt(INT4_MAX + 1)).toBeNull();
  expect(sanitizePositiveInt(INT4_MAX + 1)).toBeNull();
});

test('más tramos o series de los que persistimos no 400', () => {
  const segments = Array.from({ length: 201 }, (_, i) => ({
    position: i,
    modality: 'run',
    duration_seconds: 10,
  }));
  expect(parse({ segments }).success).toBe(true);
  const sets = Array.from({ length: 61 }, (_, i) => ({ set_index: i + 1, reps_actual: 5 }));
  expect(
    parse({
      segments: [{ position: 0, modality: 'strength', sets }],
    }).success,
  ).toBe(true);
});
