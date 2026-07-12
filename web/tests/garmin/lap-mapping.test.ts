/**
 * Pure unit tests for `deriveLapIntensity` — the Garmin lap → segment intensity
 * mapper. Focus: the mig-0124 split between RUNNING CADENCE (steps/min, its own
 * `run_cadence_spm` column) and ERG STROKE RATE (`stroke_rate_spm`). No DB.
 */
import { describe, expect, test } from 'vitest';
import { deriveLapIntensity } from '@/lib/garmin/lap-mapping';

describe('deriveLapIntensity — running cadence vs erg stroke rate (mig 0124)', () => {
  test('a run lap routes cadence to run_cadence_spm, never stroke_rate_spm', () => {
    const out = deriveLapIntensity({
      modality: 'run',
      distance_meters: 1000,
      duration_seconds: 240,
      run_cadence_spm: 176,
      stroke_rate_spm: null,
    });
    expect(out.run_cadence_spm).toBe(176);
    expect(out.stroke_rate_spm).toBeNull();
    expect(out.avg_pace_s_per_km).toBe(240);
  });

  test('an out-of-band run cadence (walking / glitch) gates to null — protects the CHECK', () => {
    const walking = deriveLapIntensity({
      modality: 'run',
      distance_meters: 1000,
      duration_seconds: 600,
      run_cadence_spm: 80, // below the 100 running floor
    });
    expect(walking.run_cadence_spm).toBeNull();

    const glitch = deriveLapIntensity({
      modality: 'run',
      distance_meters: 1000,
      duration_seconds: 200,
      run_cadence_spm: 300, // above the 250 ceiling
    });
    expect(glitch.run_cadence_spm).toBeNull();
  });

  test('a row lap keeps stroke rate in stroke_rate_spm and leaves run_cadence_spm null', () => {
    const out = deriveLapIntensity({
      modality: 'row',
      distance_meters: 500,
      duration_seconds: 110,
      stroke_rate_spm: 30,
      run_cadence_spm: null,
    });
    expect(out.stroke_rate_spm).toBe(30);
    expect(out.run_cadence_spm).toBeNull();
    expect(out.avg_pace_s_per_500m).toBe(110);
  });

  test('cadence rounds to the integer column', () => {
    const out = deriveLapIntensity({
      modality: 'run',
      distance_meters: 1000,
      duration_seconds: 240,
      run_cadence_spm: 175.6,
    });
    expect(out.run_cadence_spm).toBe(176);
    expect(typeof out.run_cadence_spm).toBe('number');
  });
});
