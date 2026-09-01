import { describe, expect, test } from 'vitest';
import { signJumpResults } from '../../lib/athlete/record-jump-attempts';
import { heightCm, flightTimeSeconds } from '../../../shared/domain/jump/physics';
import { BENCH_CMJ } from '../../../shared/domain/coach/benchmark-slugs';

describe('firmar altura en servidor', () => {
  test('acepta un value que casa con los frames kept', () => {
    const t = flightTimeSeconds(0, 149, 240)!;
    const h = heightCm(t)!;
    const signed = signJumpResults(
      [{ kind: 'cmj', takeoff_frame: 0, landing_frame: 149, fps: 240, quality: 'ok', kept: true }],
      [{ slug: BENCH_CMJ, value: h }],
    );
    expect(signed).toEqual({ ok: true });
  });

  test('422 si el teléfono miente en los cm', () => {
    const signed = signJumpResults(
      [{ kind: 'cmj', takeoff_frame: 0, landing_frame: 149, fps: 240, quality: 'ok', kept: true }],
      [{ slug: BENCH_CMJ, value: 80 }],
    );
    expect(signed).toEqual({ ok: false, error: 'height_mismatch' });
  });

  test('frames invertidos no firman', () => {
    const signed = signJumpResults(
      [{ kind: 'cmj', takeoff_frame: 10, landing_frame: 10, fps: 240, quality: 'ok', kept: true }],
      [{ slug: BENCH_CMJ, value: 47 }],
    );
    expect(signed).toEqual({ ok: false, error: 'frames_invalid' });
  });
});
