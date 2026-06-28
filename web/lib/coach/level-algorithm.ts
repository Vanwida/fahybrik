import {
  BENCH_BACK_SQUAT_1RM,
  BENCH_HYROX_OPEN,
  BENCH_RUN_5K,
  BENCH_ROW_2K,
} from '@fahybrid/shared/domain/coach/benchmark-slugs'

export type Benchmark = {
  exercise_slug: string
  value: number // in SI units: seconds for time, kg for weight
  unit: string
}

export type AthleteProfile = {
  sex: 'male' | 'female' | null
  weight_kg: number | null
  training_experience_years: number | null
}

export type LevelResult = {
  suggested_level: number // 1-5
  confidence: 'low' | 'medium' | 'high'
  signals_used: string[] // which benchmark slugs contributed
}

// Sex-aware thresholds for time-based benchmarks (values in seconds).
// Each array has 4 entries representing the upper boundary for levels 1–4.
// Interpretation: if value > thresholds[i], level = i+1; if value ≤ all thresholds, level = 5.
const THRESHOLDS = {
  [BENCH_HYROX_OPEN]: {
    male: [5400, 4500, 3900, 3300], // N1≤90min, N2≤75min, N3≤65min, N4≤55min, N5=faster
    female: [6000, 5100, 4500, 3900],
  },
  [BENCH_RUN_5K]: {
    male: [1680, 1440, 1260, 1080], // seconds
    female: [1920, 1620, 1440, 1260],
  },
  [BENCH_ROW_2K]: {
    male: [480, 440, 410, 380],
    female: [560, 510, 470, 440],
  },
} as const

// Back squat / bodyweight ratio boundaries.
// <0.9=N1, 0.9≤r<1.2=N2, 1.2≤r<1.5=N3, 1.5≤r<1.8=N4, ≥1.8=N5
const SQUAT_RATIOS = [0.9, 1.2, 1.5, 1.8] as const

// Training experience year boundaries.
// <1=N1, 1≤y<3=N2, 3≤y<5=N3, ≥5=N4 (experience alone caps at N4)
const EXPERIENCE_THRESHOLDS = [1, 3, 5] as const

type TimeBenchmarkSlug = keyof typeof THRESHOLDS

function scoreTimeBenchmark(value: number, slug: TimeBenchmarkSlug, sex: 'male' | 'female'): number {
  const thresholds = THRESHOLDS[slug][sex]
  for (let i = 0; i < thresholds.length; i++) {
    if (value > thresholds[i]) return i + 1
  }
  return 5
}

/**
 * Map a HYROX finish time (seconds) to a level 1–5 using the SINGLE-SOURCE,
 * sex-aware thresholds above (Pablo's methodology, mirrored as text in migration
 * 0057). This is the one place a HYROX time becomes a level — the real-race level
 * suggestion (computeAndStoreLevelSuggestion) and any "por qué" share it so they
 * never diverge. Unknown sex defaults to the male band (same default as suggestLevel).
 */
export function scoreHyroxTime(seconds: number, sex: 'male' | 'female' | null): number {
  return scoreTimeBenchmark(seconds, BENCH_HYROX_OPEN, sex ?? 'male')
}

function scoreSquatRatio(ratio: number): number {
  for (let i = 0; i < SQUAT_RATIOS.length; i++) {
    if (ratio < SQUAT_RATIOS[i]) return i + 1
  }
  return 5
}

function scoreExperience(years: number): number {
  for (let i = 0; i < EXPERIENCE_THRESHOLDS.length; i++) {
    if (years < EXPERIENCE_THRESHOLDS[i]) return i + 1
  }
  return 4 // experience alone caps at N4
}

export function suggestLevel(
  benchmarks: Benchmark[],
  profile: AthleteProfile,
): LevelResult {
  const sex = profile.sex ?? 'male' // default to male thresholds if unknown
  const signals: Array<{ slug: string; level: number }> = []

  // Time benchmarks (lower value = better performance = higher level)
  for (const slug of [BENCH_HYROX_OPEN, BENCH_RUN_5K, BENCH_ROW_2K] as const) {
    const bm = benchmarks.find(b => b.exercise_slug === slug)
    if (!bm) continue
    signals.push({ slug, level: scoreTimeBenchmark(bm.value, slug, sex) })
  }

  // Back squat relative to bodyweight
  const squat = benchmarks.find(b => b.exercise_slug === BENCH_BACK_SQUAT_1RM)
  if (squat && profile.weight_kg !== null && profile.weight_kg > 0) {
    const ratio = squat.value / profile.weight_kg
    signals.push({ slug: BENCH_BACK_SQUAT_1RM, level: scoreSquatRatio(ratio) })
  }

  // Fallback: training experience years (only when no benchmarks available)
  if (signals.length === 0 && profile.training_experience_years !== null) {
    signals.push({ slug: 'experience_years', level: scoreExperience(profile.training_experience_years) })
  }

  if (signals.length === 0) {
    return { suggested_level: 1, confidence: 'low', signals_used: [] }
  }

  // Weighted average rounded to nearest integer, clamped 1–5
  const avg = signals.reduce((sum, s) => sum + s.level, 0) / signals.length
  const suggested_level = Math.max(1, Math.min(5, Math.round(avg)))

  const confidence: LevelResult['confidence'] =
    signals.length >= 3 ? 'high' : signals.length === 2 ? 'medium' : 'low'

  return {
    suggested_level,
    confidence,
    signals_used: signals.map(s => s.slug),
  }
}
