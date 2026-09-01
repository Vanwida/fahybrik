import { describe, expect, test } from 'vitest';
import { JUMP_G, flightTimeSeconds, heightCm, takeoffVelocityMs, uncertaintyCm } from '../../../shared/domain/jump/physics';
import { aggregateHeights, resolveAttempt } from '../../../shared/domain/jump/session';

describe('tiempo de vuelo', () => {
  test('vuelo 149 frames a 240 fps → ~47.3 cm', () => {
    const t = flightTimeSeconds(100, 249, 240);
    expect(t).toBeCloseTo(149 / 240, 6);
    expect(t).not.toBeNull();
    expect(heightCm(t!)).toBeCloseTo(((JUMP_G * t! * t!) / 8) * 100, 6);
  });

  test('un frame a 240 fps vale ~0.6 cm alrededor de 47', () => {
    const u = uncertaintyCm(240);
    expect(u).not.toBeNull();
    expect(u!).toBeGreaterThan(0.5);
    expect(u!).toBeLessThan(0.8);
  });

  test('120 fps duplica la incertidumbre', () => {
    expect(uncertaintyCm(120)).toBeCloseTo(uncertaintyCm(240)! * 2, 2);
  });

  test('frames invertidos o fps 0 no producen altura', () => {
    expect(flightTimeSeconds(10, 10, 240)).toBeNull();
    expect(flightTimeSeconds(10, 20, 0)).toBeNull();
    expect(
      resolveAttempt({
        kind: 'cmj',
        takeoff_frame: 10,
        landing_frame: 10,
        fps: 240,
        load: { kind: 'none' },
        quality: 'ok',
      }),
    ).toBeNull();
  });

  test('un intento descartado no cuenta', () => {
    expect(
      resolveAttempt({
        kind: 'cmj',
        takeoff_frame: 0,
        landing_frame: 149,
        fps: 240,
        load: { kind: 'none' },
        quality: 'discarded',
      }),
    ).toBeNull();
  });

  test('keep best y mean_best_2', () => {
    expect(aggregateHeights([40, 47.33, 46], 'best')).toBeCloseTo(47.33, 2);
    expect(aggregateHeights([40, 47.33, 46], 'mean_best_2')).toBeCloseTo((47.33 + 46) / 2, 2);
    expect(aggregateHeights([], 'best')).toBeNull();
  });

  test('velocidad de despegue es g t / 2', () => {
    const t = 149 / 240;
    expect(takeoffVelocityMs(t)).toBeCloseTo((JUMP_G * t) / 2, 6);
  });
});
