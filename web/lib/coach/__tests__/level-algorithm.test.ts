import { describe, expect, it } from 'vitest'
import { suggestLevel, type Benchmark, type AthleteProfile } from '../level-algorithm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function profile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    sex: null,
    weight_kg: null,
    training_experience_years: null,
    ...overrides,
  }
}

function bm(exercise_slug: string, value: number, unit = 's'): Benchmark {
  return { exercise_slug, value, unit }
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('suggestLevel', () => {
  // Case 1: No benchmarks, no profile data → level 1, confidence low, signals_used []
  it('returns level 1 low confidence when no benchmarks and no profile data', () => {
    const result = suggestLevel([], profile())
    expect(result.suggested_level).toBe(1)
    expect(result.confidence).toBe('low')
    expect(result.signals_used).toEqual([])
  })

  // Case 2: hyrox_open = 5100s (85 min), sex=male
  // Male thresholds: [5400, 4500, 3900, 3300]
  // 5100 > 4500 (i=1) → level = i+1 = 2; 5100 ≤ 5400 so first check (i=0) fails
  // Wait: loop checks i=0 first: 5100 > 5400? No. i=1: 5100 > 4500? Yes → level = 2.
  it('hyrox_open 5100s male → level 2, confidence low', () => {
    const result = suggestLevel(
      [bm('hyrox_open', 5100)],
      profile({ sex: 'male' }),
    )
    expect(result.suggested_level).toBe(2)
    expect(result.confidence).toBe('low')
    expect(result.signals_used).toEqual(['hyrox_open'])
  })

  // Case 3: hyrox_open = 4200s (70 min), sex=female
  // Female thresholds: [6000, 5100, 4500, 3900]
  // i=0: 4200 > 6000? No. i=1: 4200 > 5100? No. i=2: 4200 > 4500? No. i=3: 4200 > 3900? Yes → level = 4.
  it('hyrox_open 4200s female → level 4, confidence low', () => {
    const result = suggestLevel(
      [bm('hyrox_open', 4200)],
      profile({ sex: 'female' }),
    )
    expect(result.suggested_level).toBe(4)
    expect(result.confidence).toBe('low')
    expect(result.signals_used).toEqual(['hyrox_open'])
  })

  // Case 4: 3 benchmarks all pointing to level 3 → confidence high, level 3
  // hyrox_open male: value 4050 → 4050 > 4500? No. 4050 > 3900? Yes (i=2) → level 3 ✓
  // run_5k male: thresholds [1680,1440,1260,1080]; value 1350 → 1350>1440? No; 1350>1260? Yes (i=2) → level 3 ✓
  // row_2k male: thresholds [480,440,410,380]; value 422 → 422>440? No; 422>410? Yes (i=2) → level 3 ✓
  it('three benchmarks all level 3 → level 3 confidence high', () => {
    const result = suggestLevel(
      [
        bm('hyrox_open', 4050), // male → level 3
        bm('run_5k', 1350),     // male → level 3
        bm('row_2k', 422),      // male → level 3
      ],
      profile({ sex: 'male' }),
    )
    expect(result.suggested_level).toBe(3)
    expect(result.confidence).toBe('high')
    expect(result.signals_used).toEqual(['hyrox_open', 'run_5k', 'row_2k'])
  })

  // Case 5: No benchmarks, experience_years = 4 → level 3 (3 ≤ y < 5), confidence low
  // EXPERIENCE_THRESHOLDS = [1, 3, 5]; years=4
  // i=0: 4 < 1? No. i=1: 4 < 3? No. i=2: 4 < 5? Yes → level = i+1 = 3.
  it('no benchmarks, experience_years=4 → level 3 confidence low, signals_used=[experience_years]', () => {
    const result = suggestLevel(
      [],
      profile({ training_experience_years: 4 }),
    )
    expect(result.suggested_level).toBe(3)
    expect(result.confidence).toBe('low')
    expect(result.signals_used).toEqual(['experience_years'])
  })

  // Case 6: back_squat_1rm=80kg, weight_kg=70kg → ratio=1.14
  // SQUAT_RATIOS = [0.9, 1.2, 1.5, 1.8]; ratio=1.14
  // i=0: 1.14 < 0.9? No. i=1: 1.14 < 1.2? Yes → level = i+1 = 2.
  // Slug is the canonical `back_squat_1rm` the onboarding route writes.
  it('back_squat_1rm 80kg / weight 70kg → ratio 1.14 → level 2, confidence low', () => {
    const result = suggestLevel(
      [bm('back_squat_1rm', 80, 'kg')],
      profile({ weight_kg: 70 }),
    )
    expect(result.suggested_level).toBe(2)
    expect(result.confidence).toBe('low')
    expect(result.signals_used).toEqual(['back_squat_1rm'])
  })
})
