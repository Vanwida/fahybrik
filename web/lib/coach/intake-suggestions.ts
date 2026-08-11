// Pure intake suggestion helpers (no DB). Imported by intake.ts and tests.
//
// These power Step 2 (macrocycle config), Step 3 (level), Step 4 (baseline tests),
// Step 5 (welcome draft) of the intake wizard. Pablo can override every output;
// the goal is a sensible starting point that handles the bulk of cases.

import {
  BENCH_BACK_SQUAT_1RM,
  BENCH_DEADLIFT_1RM,
  BENCH_BENCH_PRESS_1RM,
  BENCH_OHP_1RM,
  BENCH_CLEAN_1RM,
  BENCH_SNATCH_1RM,
  BENCH_STRICT_PULL_UP_MAX,
  BENCH_PUSH_UPS_PER_MIN,
  BENCH_RUN_5K,
  BENCH_RUN_10K,
  BENCH_RUN_HALF,
  BENCH_ROW_2K,
  BENCH_SKI_1K,
  BENCH_HYROX_PRO,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { defaultTramoName } from './intake-schema';
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

// AGNOSTIC starting shape: propose a sequence of named microciclos sized by the
// weeks available before the A-event (roughly 42 / 36 / 22 of the weeks across 3
// microciclos; compressed for short windows). The names are neutral placeholders
// ("Microciclo N") — the coach renames, resizes and reorders every one; the ORDER
// of microciclos IS the periodization. Advisory only, never a constraint.
function microciclo(n: number, weeks: number): IntakeBlockSpec {
  // El nombre neutro vive en el esquema compartido (`defaultTramoName`) porque
  // la pantalla lo necesita también, al añadir un tramo a mano en modo personal.
  return { type: defaultTramoName(n), weeks };
}

export function proposeBlockSpecs(total_days: number): IntakeBlockSpec[] {
  const totalWeeks = total_days <= 0 ? 12 : Math.max(2, Math.round(total_days / 7));

  if (totalWeeks <= 3) {
    return [microciclo(1, Math.max(1, totalWeeks - 1)), microciclo(2, 1)];
  }
  if (totalWeeks <= 6) {
    const first = 1;
    const last = totalWeeks <= 4 ? 1 : 2;
    const mid = Math.max(1, totalWeeks - first - last);
    return [microciclo(1, first), microciclo(2, mid), microciclo(3, last)];
  }

  const last = Math.max(2, Math.round(totalWeeks * 0.22));
  const first = Math.max(2, Math.round(totalWeeks * 0.42));
  const mid = Math.max(2, totalWeeks - first - last);
  return [microciclo(1, first), microciclo(2, mid), microciclo(3, last)];
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
 * macro EMPHASIS. This does NOT change microciclo names/weeks (the shape is
 * owned by `proposeBlockSpecs` + days-to-event); it tells the coach/IA which
 * axis to weight inside those microciclos. Pablo can ignore it — it's a starting
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
    (b) => b.exercise_slug === BENCH_HYROX_PRO && b.value > 0 && b.value <= 60 * 60,
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

// Thresholds keyed by the CANONICAL benchmark slugs the onboarding route writes
// (see @fahybrid/shared/domain/coach/benchmark-slugs). Values unchanged.
const ELITE_THRESHOLDS: Record<string, { value: number; better_when: 'gte' | 'lte' }> = {
  [BENCH_BACK_SQUAT_1RM]: { value: 130, better_when: 'gte' },
  [BENCH_DEADLIFT_1RM]: { value: 170, better_when: 'gte' },
  [BENCH_BENCH_PRESS_1RM]: { value: 95, better_when: 'gte' },
  [BENCH_OHP_1RM]: { value: 60, better_when: 'gte' },
  [BENCH_CLEAN_1RM]: { value: 90, better_when: 'gte' },
  [BENCH_SNATCH_1RM]: { value: 65, better_when: 'gte' },
  [BENCH_STRICT_PULL_UP_MAX]: { value: 20, better_when: 'gte' },
  [BENCH_PUSH_UPS_PER_MIN]: { value: 60, better_when: 'gte' },
  [BENCH_RUN_5K]: { value: 21 * 60, better_when: 'lte' },
  [BENCH_RUN_10K]: { value: 44 * 60, better_when: 'lte' },
  [BENCH_RUN_HALF]: { value: 1.6 * 3600, better_when: 'lte' },
  [BENCH_ROW_2K]: { value: 7 * 60 + 20, better_when: 'lte' },
  [BENCH_SKI_1K]: { value: 4 * 60 + 5, better_when: 'lte' },
  [BENCH_HYROX_PRO]: { value: 70 * 60, better_when: 'lte' },
};

const STRONG_THRESHOLDS: Record<string, { value: number; better_when: 'gte' | 'lte' }> = {
  [BENCH_BACK_SQUAT_1RM]: { value: 110, better_when: 'gte' },
  [BENCH_DEADLIFT_1RM]: { value: 140, better_when: 'gte' },
  [BENCH_BENCH_PRESS_1RM]: { value: 80, better_when: 'gte' },
  [BENCH_OHP_1RM]: { value: 50, better_when: 'gte' },
  [BENCH_CLEAN_1RM]: { value: 75, better_when: 'gte' },
  [BENCH_SNATCH_1RM]: { value: 55, better_when: 'gte' },
  [BENCH_STRICT_PULL_UP_MAX]: { value: 12, better_when: 'gte' },
  [BENCH_PUSH_UPS_PER_MIN]: { value: 45, better_when: 'gte' },
  [BENCH_RUN_5K]: { value: 23 * 60, better_when: 'lte' },
  [BENCH_RUN_10K]: { value: 48 * 60, better_when: 'lte' },
  [BENCH_RUN_HALF]: { value: 1.85 * 3600, better_when: 'lte' },
  [BENCH_ROW_2K]: { value: 7 * 60 + 50, better_when: 'lte' },
  [BENCH_SKI_1K]: { value: 4 * 60 + 30, better_when: 'lte' },
  [BENCH_HYROX_PRO]: { value: 80 * 60, better_when: 'lte' },
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

  const missing1RM = [
    BENCH_BACK_SQUAT_1RM,
    BENCH_DEADLIFT_1RM,
    BENCH_BENCH_PRESS_1RM,
    BENCH_CLEAN_1RM,
  ].filter((s) => !slugs.has(s));
  if (missing1RM.length >= 2) {
    tests.push({
      slug: 'one_rm_battery',
      label: `Update 1RMs (${missing1RM.length} faltan)`,
      kind: 'programmed',
      scheduled_for: null,
    });
  }

  if (!slugs.has(BENCH_RUN_5K) && !slugs.has(BENCH_RUN_10K)) {
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
  /** Athlete's sex — drives the gendered welcome adjective so we never misgender
   *  (female → "bienvenida"). Unknown / 'other' falls back to neutral phrasing. */
  sex: 'male' | 'female' | 'other' | null;
  target_event: { name: string; is_in_past: boolean } | null;
  is_compressive: boolean;
  /** Whether the athlete actually completed intake (objetivos / experiencia /
   *  benchmarks / estado basal). When false, the draft MUST NOT claim a review
   *  that didn't happen — there is nothing to have reviewed. */
  has_intake_data: boolean;
}): string {
  const first = params.full_name.split(' ')[0];
  const eventPhrase = params.target_event && !params.target_event.is_in_past
    ? `El plan apunta a ${params.target_event.name}.`
    : 'Vamos a definir tu evento objetivo en los próximos días.';
  const weekPhrase = params.is_compressive
    ? 'Esta semana es testing + arranque comprimido.'
    : 'Esta semana es testing + arranque del primer microciclo.';
  // The welcome adjective agrees with the athlete's sex. When sex is unknown or
  // 'other' we use a non-gendered phrasing ("te doy la bienvenida") so the draft
  // never assumes a gender — masculine-by-default was the bug.
  const welcome =
    params.sex === 'male' ? 'bienvenido'
    : params.sex === 'female' ? 'bienvenida'
    : null;
  // Honest opener: only assert a profile review when the athlete actually
  // submitted intake answers. Otherwise welcome without the false claim and ask
  // for the missing context.
  const opener = params.has_intake_data
    ? `Hola ${first}, ${welcome ?? 'te doy la bienvenida'}. He revisado tu perfil — tienes buena base. ${eventPhrase}`
    : `Hola ${first}, ${welcome ? `${welcome} a bordo` : 'te doy la bienvenida'}. Cuéntame tus objetivos y tu punto de partida para ajustar el plan. ${eventPhrase}`;
  return [opener, weekPhrase, 'Cualquier duda escríbeme. Vamos.'].join(' ');
}

// =============================================================================
// Outlier detection
// =============================================================================

const OUTLIER_CAPS: Record<string, number> = {
  [BENCH_BACK_SQUAT_1RM]: 220,
  [BENCH_DEADLIFT_1RM]: 260,
  [BENCH_BENCH_PRESS_1RM]: 160,
  [BENCH_OHP_1RM]: 110,
  [BENCH_CLEAN_1RM]: 150,
  [BENCH_SNATCH_1RM]: 120,
  [BENCH_STRICT_PULL_UP_MAX]: 50,
  [BENCH_PUSH_UPS_PER_MIN]: 120,
};

export function detectBenchmarkOutliers(bench: SuggestionBenchmark[]): string[] {
  return bench
    .filter((b) => {
      const cap = OUTLIER_CAPS[b.exercise_slug];
      return cap !== undefined && b.value > cap;
    })
    .map((b) => b.label);
}
