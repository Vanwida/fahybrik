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
  BENCH_HYROX_OPEN,
  BENCH_RUN_5K,
  BENCH_ROW_2K,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import {
  LEVEL_METRIC_SPEC,
  resolveLadder,
  suggestLevelOnLadder,
  type AthleteMarks,
  type LevelSuggestion,
  type ResolvedRung,
} from '@fahybrid/shared/domain/coach/level-criteria';
import type {
  AthleteLevel,
} from './intake-schema';

export interface SuggestionBenchmark {
  exercise_slug: string;
  label: string;
  value: number;
  unit: string;
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
 * Translate the goal + self-declared run/strength relationship into a macro
 * EMPHASIS. Advisory only: which axis to weight. The coach can ignore it.
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
  /** La escalera del coach (`loadCoachLadder`). Sin ella, la de los defectos del producto. */
  ladder?: ResolvedRung[];
  sex?: 'male' | 'female' | null;
}

// El TRAMO del cuestionario (1 principiante · 2 intermedio · 3 pro · 4 élite)
// cuando el atleta no lo declaró. No hay una segunda tabla de cortes: se lee
// con la MISMA escalera que la sugerencia de nivel del coach
// (shared/domain/coach/level-criteria.ts — sus cortes o, sin escalera, los
// defectos del producto) y el escalón se reparte en proporción sobre los cuatro
// tramos, redondeando hacia abajo (con pocos datos, mejor quedarse corto). Antes había aquí una lista propia de «marcas élite» (sentadilla 130,
// 5K 21′, HYROX Pro 70′…) que era método cableado y discrepaba de la otra.
// Ver DECISIONS 2026-09-23 «Qué marca abre cada nivel».
//
// Es punto de partida, no veredicto: el coach confirma siempre.
const TIERS = 4;

function tierFromRung(position: number, rungs: number): AthleteLevel {
  if (rungs <= 1) return 1;
  const t = 1 + Math.floor(((position - 1) * TIERS) / rungs);
  return Math.max(1, Math.min(TIERS, t)) as AthleteLevel;
}

/** Las marcas del alta en las unidades de la escalera (sin peso: la sentadilla relativa no entra). */
function intakeMarks(params: InferLevelParams): AthleteMarks {
  const marks: AthleteMarks = {};
  const find = (slug: string) => params.benchmarks.find((b) => b.exercise_slug === slug)?.value ?? null;
  const hyrox = find(BENCH_HYROX_OPEN);
  if (hyrox != null && hyrox > 0) marks.hyrox_s = hyrox;
  const run5k = find(BENCH_RUN_5K);
  if (run5k != null && run5k > 0) marks.run_5k_s = run5k;
  const row2k = find(BENCH_ROW_2K);
  if (row2k != null && row2k > 0) marks.row_2k_s = row2k;
  if (params.training_experience_years != null) marks.experience_years = params.training_experience_years;
  return marks;
}

function defaultLadder(): ResolvedRung[] {
  return resolveLadder(
    Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1), name: String(i + 1), criteria_set_at: null, criteria: [] })),
  );
}

function readLadder(params: InferLevelParams): { suggestion: LevelSuggestion; rungs: number } {
  const ladder = params.ladder && params.ladder.length > 0 ? params.ladder : defaultLadder();
  return { suggestion: suggestLevelOnLadder(ladder, intakeMarks(params), params.sex ?? null), rungs: ladder.length };
}

export function inferLevel(params: InferLevelParams): AthleteLevel {
  const { suggestion, rungs } = readLadder(params);
  if (suggestion.status !== 'suggested') return 1;
  // Guarda del objetivo: una «primera HYROX» o «completar y disfrutar» sin una
  // sola marca de rendimiento (solo años) es principiante. Nunca sube a nadie.
  const goal = params.goal?.goal_type ?? null;
  const onlyYears = suggestion.signals.every((m) => m === 'experience_years');
  if ((goal === 'first_hyrox' || goal === 'complete_fun') && onlyYears) return 1;
  return tierFromRung(suggestion.position, rungs);
}

const TIER_NAME: Record<AthleteLevel, string> = {
  1: 'principiante',
  2: 'intermedio',
  3: 'pro',
  4: 'élite competitivo',
};

export function explainLevel(
  level: AthleteLevel,
  ctx: {
    training_experience_years: number | null;
    benchmarks: SuggestionBenchmark[];
    division: string | null;
    /** La misma escalera con la que se infirió el tramo (sin ella, los defectos). */
    ladder?: ResolvedRung[];
    sex?: 'male' | 'female' | null;
  },
): string {
  const { suggestion } = readLadder({
    benchmarks: ctx.benchmarks,
    training_experience_years: ctx.training_experience_years,
    ladder: ctx.ladder,
    sex: ctx.sex,
  });
  const parts: string[] = [];
  const yrs = ctx.training_experience_years ?? 0;
  if (yrs > 0) parts.push(`${yrs} ${yrs === 1 ? 'año' : 'años'} entrenando`);
  if (suggestion.status === 'suggested') {
    const marks = suggestion.signals.filter((m) => m !== 'experience_years').map((m) => LEVEL_METRIC_SPEC[m].label);
    if (marks.length > 0) parts.push(`marcas: ${marks.join(', ')}`);
  }
  if (ctx.division) parts.push(ctx.division);
  if (parts.length === 0) parts.push('datos limitados del alta');
  return `${parts.join(' · ')} → ${TIER_NAME[level]}`;
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
    : 'Si entrenas para alguna carrera, dime cuál y apuntamos el plan a esa fecha.';
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
  return [opener, 'Cualquier duda, escríbeme. Vamos.'].join(' ');
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
