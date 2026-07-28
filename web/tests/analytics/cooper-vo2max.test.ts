/**
 * The Cooper 12-minute test read as a VO₂max measurement.
 *
 * This is the ONE way an athlete with no compatible watch gets a real VO₂max
 * instead of a number modelled off a race pace — it is what the VO₂max screen's
 * empty state sends them to do, so the regression has to hold and the bounds
 * have to reject garbage rather than print an absurd headline.
 */
import { describe, expect, test } from 'vitest';
import { vo2maxFromCooperMeters } from '@fahybrid/shared/domain/running/vdot';

describe('vo2maxFromCooperMeters', () => {
  test('Cooper (1968): VO₂max = (metres − 504.9) / 44.73', () => {
    // 2 800 m — a well-trained recreational runner.
    expect(vo2maxFromCooperMeters(2800)).toBe(51.3);
    // 2 400 m — the classic "average fit adult male" reference distance.
    expect(vo2maxFromCooperMeters(2400)).toBe(42.4);
    // 3 600 m — elite territory.
    expect(vo2maxFromCooperMeters(3600)).toBe(69.2);
  });

  test('rounds to one decimal — the precision the screen shows', () => {
    const v = vo2maxFromCooperMeters(2653);
    expect(v).not.toBeNull();
    expect(Number.isInteger(v! * 10)).toBe(true);
  });

  test('rejects distances that imply an impossible VO₂max', () => {
    // Below the plausibility floor: a mistyped 1 200 m (VDOT_MIN is 25).
    expect(vo2maxFromCooperMeters(1000)).toBeNull();
    // Above the ceiling: nobody covers 5 km in 12 minutes.
    expect(vo2maxFromCooperMeters(5000)).toBeNull();
  });

  test('rejects nothing-at-all rather than inventing a number', () => {
    expect(vo2maxFromCooperMeters(null)).toBeNull();
    expect(vo2maxFromCooperMeters(undefined)).toBeNull();
    expect(vo2maxFromCooperMeters(0)).toBeNull();
    expect(vo2maxFromCooperMeters(-2800)).toBeNull();
    expect(vo2maxFromCooperMeters(Number.NaN)).toBeNull();
  });
});
