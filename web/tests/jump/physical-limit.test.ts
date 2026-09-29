// Un salto que ningún humano puede dar no se guarda (0278).
//
// 13-08-2026: el atleta marcó el aterrizaje del tercer CMJ en el fotograma 1161
// (despegue 580, 239,70 fps): 2,42 s de vuelo, 720 cm. El servidor lo firmó y lo
// guardó como su marca de CMJ. El techo es FÍSICO (1 s de vuelo, 122,6 cm), no
// del coach.

import { describe, expect, test } from 'vitest';
import {
  JUMP_FLIGHT_MAX_S,
  JUMP_HEIGHT_MAX_CM,
  flightTimeSeconds,
  isPlausibleJumpFlight,
} from '../../../shared/domain/jump/physics';
import { resolveAttempt } from '../../../shared/domain/jump/session';
import {
  jumpAttemptInputSchema,
  recordTestResultsBodySchema,
} from '../../../shared/schema/test-battery';

const IMPOSSIBLE = { kind: 'cmj' as const, takeoff_frame: 580, landing_frame: 1161, fps: 239.7 };
const REAL = { kind: 'cmj' as const, takeoff_frame: 155, landing_frame: 311, fps: 239.69 };

describe('el techo físico del salto', () => {
  test('1 s de vuelo son 122,625 cm', () => {
    expect(JUMP_FLIGHT_MAX_S).toBe(1);
    expect(JUMP_HEIGHT_MAX_CM).toBeCloseTo(122.625, 6);
  });

  test('un vuelo posible lo es; el del 13-08 no', () => {
    expect(isPlausibleJumpFlight(flightTimeSeconds(REAL.takeoff_frame, REAL.landing_frame, REAL.fps))).toBe(true);
    expect(
      isPlausibleJumpFlight(flightTimeSeconds(IMPOSSIBLE.takeoff_frame, IMPOSSIBLE.landing_frame, IMPOSSIBLE.fps)),
    ).toBe(false);
    expect(isPlausibleJumpFlight(null)).toBe(false);
  });

  test('un intento imposible no se resuelve en altura', () => {
    expect(resolveAttempt({ ...IMPOSSIBLE, load: { kind: 'none' }, quality: 'ok' })).toBeNull();
    const real = resolveAttempt({ ...REAL, load: { kind: 'none' }, quality: 'ok' });
    expect(real?.height_cm).toBeCloseTo(51.94, 1);
  });
});

describe('la escritura (zod) rechaza lo imposible', () => {
  test('un intento que cuenta con un vuelo imposible no pasa', () => {
    const parsed = jumpAttemptInputSchema.safeParse({ ...IMPOSSIBLE, quality: 'ok', kept: true });
    expect(parsed.success).toBe(false);
  });

  test('descartado, en cambio, se admite como rastro', () => {
    const parsed = jumpAttemptInputSchema.safeParse({ ...IMPOSSIBLE, quality: 'discarded', kept: false });
    expect(parsed.success).toBe(true);
  });

  test('el cuerpo del 13-08 entero no pasa', () => {
    const parsed = recordTestResultsBodySchema.safeParse({
      results: [{ slug: 'cmj', value: 720.452 }],
      attempts: [
        { ...REAL, quality: 'ok', kept: true },
        { ...IMPOSSIBLE, quality: 'ok', kept: true },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
