// Pure intake suggestion helpers (no DB). Imported by intake.ts and tests.
//
// These power Step 2 (macrocycle config), Step 3 (level), Step 4 (baseline tests),
// Step 5 (welcome draft) of the intake wizard. Pablo can override every output;
// the goal is a sensible starting point that handles the bulk of cases.

import { DEFAULT_BLOCK_SPECS, type BlockSpec } from '@fahybrid/shared/domain/atr/planner';
import type {
  AthleteLevel,
  IntakeBaselineTest,
  IntakeBlockSpec,
} from './intake-schema';

export interface SuggestionBenchmark {
  exercise_slug: string;
  label: string;
  value: number;
  unit: string;
}

// Block specs given days available before A-event. ATR ratio is roughly
// ACC 40 / TRANS 35 / REAL 25 of available weeks. Below 6 weeks total we
// compress ACC to a single week; below 4 weeks we drop ACC entirely.
export function proposeBlockSpecs(total_days: number): IntakeBlockSpec[] {
  if (total_days <= 0) {
    return DEFAULT_BLOCK_SPECS.map(toIntakeBlockSpec);
  }
  const totalWeeks = Math.max(2, Math.round(total_days / 7));

  if (totalWeeks <= 3) {
    return [
      { type: 'TRANS', weeks: Math.max(1, totalWeeks - 1) },
      { type: 'REAL', weeks: 1 },
    ];
  }
  if (totalWeeks <= 6) {
    const acc = 1;
    const real = totalWeeks <= 4 ? 1 : 2;
    const trans = Math.max(1, totalWeeks - acc - real);
    return [
      { type: 'ACC', weeks: acc },
      { type: 'TRANS', weeks: trans },
      { type: 'REAL', weeks: real },
    ];
  }

  const real = Math.max(2, Math.round(totalWeeks * 0.22));
  const acc = Math.max(2, Math.round(totalWeeks * 0.42));
  const trans = Math.max(2, totalWeeks - acc - real);
  return [
    { type: 'ACC', weeks: acc },
    { type: 'TRANS', weeks: trans },
    { type: 'REAL', weeks: real },
  ];
}

function toIntakeBlockSpec(b: BlockSpec): IntakeBlockSpec {
  return { type: b.type, weeks: b.weeks };
}

// =============================================================================
// Block emphasis (Step 2 → coach/IA advisory)
// =============================================================================

export interface BlockEmphasis {
  /** Dominant training axis the macro should weight toward. */
  bias: 'running' | 'strength' | 'hyrox_specific' | 'balanced';
  /** One-line rationale surfaced to the coach (and to the IA as context). */
  note: string;
}

/**
 * Translate the Step-2 goal + self-declared run/strength relationship into a
 * macro EMPHASIS. This does NOT change block types/weeks (ATR structure is
 * owned by `proposeBlockSpecs` + days-to-event); it tells the coach/IA which
 * axis to weight inside those blocks. Pablo can ignore it — it's a starting
 * bias, not a constraint.
 */
export function proposeBlockEmphasis(goal: IntakeGoalContext): BlockEmphasis {
  const reasons: string[] = [];

  let bias: BlockEmphasis['bias'] = 'balanced';
  switch (goal.goal_type) {
    case 'improve_running':
      bias = 'running';
      reasons.push('meta = mejorar carrera');
      break;
    case 'improve_hyrox_mark':
      bias = 'hyrox_specific';
      reasons.push('meta = mejorar marca HYROX (peso en transiciones/estaciones)');
      break;
    case 'first_hyrox':
      bias = 'hyrox_specific';
      reasons.push('primera HYROX (familiarizar estaciones + base aeróbica)');
      break;
    case 'complete_fun':
      bias = 'balanced';
      reasons.push('completar/disfrutar (volumen moderado, sin sobrecarga)');
      break;
    default:
      break;
  }

  // Run/strength relationship refines or overrides the goal bias when extreme.
  if (goal.run_experience === 'none' || goal.run_experience === 'reluctant') {
    reasons.push('poca afinidad con correr → introducir running de forma progresiva');
    if (bias === 'balanced') bias = 'running';
  }
  if (goal.strength_experience === 'none' || goal.strength_experience === 'with_guidance') {
    reasons.push('base de fuerza limitada → técnica antes que carga');
    if (bias === 'balanced') bias = 'strength';
  }
  if (goal.run_experience === 'enthusiast' && goal.strength_experience === 'none') {
    bias = 'strength';
    reasons.push('corredor sin fuerza → prioriza bloque de fuerza');
  }

  return {
    bias,
    note: reasons.length > 0 ? reasons.join(' · ') : 'perfil equilibrado, sin sesgo marcado',
  };
}

// =============================================================================
// Level inference
// =============================================================================

// Step 2 onboarding signals that nudge level inference. Self-declared running /
// strength relationship + primary goal. Soft nudges only — benchmarks + years
// stay the spine; these break ties and flag obvious mismatches (a "first HYROX"
// athlete with no elite marks should not infer high).
export type GoalType =
  | 'first_hyrox'
  | 'improve_hyrox_mark'
  | 'improve_running'
  | 'complete_fun'
  | 'other';
export type RunExperience = 'enthusiast' | 'comfortable' | 'reluctant' | 'none';
export type StrengthExperience = 'loves_lifting' | 'weekly_ish' | 'with_guidance' | 'none';

export interface IntakeGoalContext {
  goal_type: GoalType | null;
  run_experience: RunExperience | null;
  strength_experience: StrengthExperience | null;
}

interface InferLevelParams {
  benchmarks: SuggestionBenchmark[];
  training_experience_years: number | null;
  goal?: IntakeGoalContext;
}

// Level 1 = beginner, 2 = intermediate, 3 = pro, 4 = élite (4 niveles cerrados
// por decisión #4). Heurística sobre experiencia + benchmarks. Pablo confirma
// siempre — es punto de partida, no veredicto.
//
// Promote a 4 (élite) solo con señales muy claras: tiempo HYROX pro declarado o
// combinación de varios PRs en rango élite + experiencia alta. Mantener nivel 3
// para "élite hits" más generales (regla original sigue intacta).
export function inferLevel(params: InferLevelParams): AthleteLevel {
  const yrs = params.training_experience_years ?? 0;
  const eliteHits = countEliteHits(params.benchmarks);
  const strongHits = countStrongHits(params.benchmarks);
  const hasHyroxElite = params.benchmarks.some(
    (b) => b.exercise_slug === 'hyrox_pro' && b.value > 0 && b.value <= 60 * 60,
  );

  // Nivel 4 (élite competitivo): sub-1h HYROX + >=4y, o >=4 marcas élite + >=5y.
  if (hasHyroxElite && yrs >= 4) return 4;
  if (eliteHits >= 4 && yrs >= 5) return 4;
  if (yrs >= 3 && eliteHits >= 2) return 3;

  const base: AthleteLevel = yrs >= 2 && (eliteHits >= 1 || strongHits >= 3) ? 2 : 1;

  // Step-2 goal nudge: a "first HYROX" with no objective elite signal is a
  // beginner regardless of years tinkering; "complete_fun" likewise caps at
  // beginner unless real marks contradict it. Never PROMOTES (objective marks
  // own the ceiling) — only guards against over-leveling on thin data.
  const goal = params.goal?.goal_type ?? null;
  if ((goal === 'first_hyrox' || goal === 'complete_fun') && eliteHits === 0) {
    return 1;
  }
  return base;
}

const ELITE_THRESHOLDS: Record<string, { value: number; better_when: 'gte' | 'lte' }> = {
  back_squat: { value: 130, better_when: 'gte' },
  deadlift: { value: 170, better_when: 'gte' },
  bench_press: { value: 95, better_when: 'gte' },
  ohp: { value: 60, better_when: 'gte' },
  clean: { value: 90, better_when: 'gte' },
  snatch: { value: 65, better_when: 'gte' },
  pull_ups: { value: 20, better_when: 'gte' },
  push_ups: { value: 60, better_when: 'gte' },
  '5k_run': { value: 21 * 60, better_when: 'lte' },
  '10k_run': { value: 44 * 60, better_when: 'lte' },
  half_marathon: { value: 1.6 * 3600, better_when: 'lte' },
  '2k_row': { value: 7 * 60 + 20, better_when: 'lte' },
  '1k_ski': { value: 4 * 60 + 5, better_when: 'lte' },
  hyrox_pro: { value: 70 * 60, better_when: 'lte' },
};

const STRONG_THRESHOLDS: Record<string, { value: number; better_when: 'gte' | 'lte' }> = {
  back_squat: { value: 110, better_when: 'gte' },
  deadlift: { value: 140, better_when: 'gte' },
  bench_press: { value: 80, better_when: 'gte' },
  ohp: { value: 50, better_when: 'gte' },
  clean: { value: 75, better_when: 'gte' },
  snatch: { value: 55, better_when: 'gte' },
  pull_ups: { value: 12, better_when: 'gte' },
  push_ups: { value: 45, better_when: 'gte' },
  '5k_run': { value: 23 * 60, better_when: 'lte' },
  '10k_run': { value: 48 * 60, better_when: 'lte' },
  half_marathon: { value: 1.85 * 3600, better_when: 'lte' },
  '2k_row': { value: 7 * 60 + 50, better_when: 'lte' },
  '1k_ski': { value: 4 * 60 + 30, better_when: 'lte' },
  hyrox_pro: { value: 80 * 60, better_when: 'lte' },
};

export function countEliteHits(bench: SuggestionBenchmark[]): number {
  let n = 0;
  for (const b of bench) {
    const t = ELITE_THRESHOLDS[b.exercise_slug];
    if (!t) continue;
    if (t.better_when === 'gte' ? b.value >= t.value : b.value <= t.value) n += 1;
  }
  return n;
}

function countStrongHits(bench: SuggestionBenchmark[]): number {
  let n = 0;
  for (const b of bench) {
    const t = STRONG_THRESHOLDS[b.exercise_slug];
    if (!t) continue;
    if (t.better_when === 'gte' ? b.value >= t.value : b.value <= t.value) n += 1;
  }
  return n;
}

export function explainLevel(
  level: AthleteLevel,
  ctx: {
    training_experience_years: number | null;
    benchmarks: SuggestionBenchmark[];
    division: string | null;
  },
): string {
  const yrs = ctx.training_experience_years ?? 0;
  const eliteCount = countEliteHits(ctx.benchmarks);
  const parts: string[] = [];
  if (yrs > 0) parts.push(`${yrs}y experiencia`);
  if (eliteCount > 0) parts.push(`${eliteCount} marcas en rango élite`);
  if (ctx.division) parts.push(ctx.division);
  if (parts.length === 0) parts.push('datos limitados de onboarding');
  const tail =
    level === 4
      ? 'élite competitivo'
      : level === 3
        ? 'pro'
        : level === 2
          ? 'intermedio'
          : 'principiante';
  return `${parts.join(' · ')} → ${tail}`;
}

// =============================================================================
// Baseline tests
// =============================================================================

interface RecommendTestsParams {
  benchmarks: SuggestionBenchmark[];
  is_compressive: boolean;
}

export function recommendBaselineTests(params: RecommendTestsParams): IntakeBaselineTest[] {
  const slugs = new Set(params.benchmarks.map((b) => b.exercise_slug));
  const tests: IntakeBaselineTest[] = [
    {
      slug: 'hrv_baseline_7d',
      label: 'HRV baseline 7d',
      kind: 'auto',
      scheduled_for: null,
    },
    {
      slug: 'sleep_baseline_7d',
      label: 'Sleep tracking 7d',
      kind: 'auto',
      scheduled_for: null,
    },
  ];

  if (!params.is_compressive) {
    tests.push({
      slug: 'hyrox_sim_half',
      label: 'HYROX simulation half',
      kind: 'programmed',
      scheduled_for: null,
    });
  }

  const missing1RM = ['back_squat', 'deadlift', 'bench_press', 'clean'].filter((s) => !slugs.has(s));
  if (missing1RM.length >= 2) {
    tests.push({
      slug: 'one_rm_battery',
      label: `Update 1RMs (${missing1RM.length} faltan)`,
      kind: 'programmed',
      scheduled_for: null,
    });
  }

  if (!slugs.has('5k_run') && !slugs.has('10k_run')) {
    tests.push({
      slug: 'endurance_5k',
      label: '5K test endurance',
      kind: 'programmed',
      scheduled_for: null,
    });
  }

  return tests;
}

// =============================================================================
// Welcome message draft
// =============================================================================

export function composeWelcomeDraft(params: {
  full_name: string;
  target_event: { name: string; is_in_past: boolean } | null;
  is_compressive: boolean;
}): string {
  const first = params.full_name.split(' ')[0];
  const eventPhrase = params.target_event && !params.target_event.is_in_past
    ? `El plan apunta a ${params.target_event.name}.`
    : 'Vamos a definir tu evento objetivo en los próximos días.';
  const weekPhrase = params.is_compressive
    ? 'Esta semana es testing + ACC compresivo.'
    : 'Esta semana es testing + arranque de bloque.';
  return [
    `Hola ${first}, bienvenido. He revisado tu perfil — tienes`,
    `buena base. ${eventPhrase}`,
    weekPhrase,
    'Cualquier duda escríbeme. Vamos.',
  ].join(' ');
}

// =============================================================================
// Outlier detection
// =============================================================================

const OUTLIER_CAPS: Record<string, number> = {
  back_squat: 220,
  deadlift: 260,
  bench_press: 160,
  ohp: 110,
  clean: 150,
  snatch: 120,
  pull_ups: 50,
  push_ups: 120,
};

export function detectBenchmarkOutliers(bench: SuggestionBenchmark[]): string[] {
  return bench
    .filter((b) => {
      const cap = OUTLIER_CAPS[b.exercise_slug];
      return cap !== undefined && b.value > cap;
    })
    .map((b) => b.label);
}
