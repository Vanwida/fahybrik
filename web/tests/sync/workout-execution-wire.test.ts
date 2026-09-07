/**
 * Contrato de escritura del único writer (POST /api/sync/workout-execution).
 *
 * Zod no rechaza un campo: rechaza la PETICIÓN. Un valor imposible de aparato
 * o un instante con offset local 400aba el POST entero — error distinto cada
 * día, misma sesión perdida. Identidad (assignment, position, modality) sigue
 * estricta. Lo demás entra y se gatea al persistir.
 *
 * Puro: sin base de datos.
 */
import { expect, test } from 'vitest';
import { workoutExecutionSchema } from '@/lib/sync/record-workout-execution';
import {
  clipText,
  sanitizeCompleteness,
  sanitizeDeclaredSource,
  sanitizeDurationSeconds,
  sanitizeHrSource,
  sanitizeLegRole,
  sanitizeNonNegative,
  sanitizeNonNegativeInt,
  sanitizeNotes,
  sanitizePerceivedExertion,
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

test('la identidad sigue estricta', () => {
  expect(parse({ segments: [{ position: -1, modality: 'run' }] }).success).toBe(false);
  expect(parse({ segments: [{ position: 0, modality: '' }] }).success).toBe(false);
});
