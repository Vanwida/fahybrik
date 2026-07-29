// Methodology rule-engine VOCABULARY (spec §3) — the exhaustive, closed sets of
// condition metrics, action verbs, operators, units and supporting enums that a
// coach's decision rule can be built from.
//
// WHY THIS EXISTS
// ---------------
// A methodology rule is "WHEN [condition] THEN [action]" (see rule.ts). The
// condition and action are NOT free text: every metric the IA can read and every
// adjustment it can make is enumerated here so the rule builder (NL → chips),
// the conflict evaluator, and the plan adapter all share ONE source of truth.
// New capability = add a member here, in ONE place; nothing downstream guesses.
//
// These enums are mirrored by CHECK constraints on `methodology_rules`
// (migration 0048) so a row that doesn't validate here can't exist in the DB.

import { z } from 'zod';

// ── Condition metrics (spec §3, exhaustive) ─────────────────────────────────
// What a rule can observe. Grouped by source for readability; the enum itself is
// flat. Each metric's typical operator + unit are documented in METRIC_META.
export const conditionMetric = z.enum([
  // wearable / recovery
  'hrv_delta_vs_baseline',
  'hrv_ms',
  'resting_hr',
  'resting_hr_delta_vs_baseline',
  'sleep_hours',
  // check-in subjective (1-5 / 1-10)
  'sleep_quality',
  'soreness',
  'fatigue',
  'mood',
  'motivation',
  'stress_level',
  'sub_score',
  'perceived_effort_presession',
  'perceived_difficulty',
  // derived readiness
  'readiness_score',
  'overtraining_composite',
  // live (intra-session)
  'rpe_live',
  'rir_live',
  'pace_drift_intra',
  'pace_consistency',
  'pace_vs_target',
  'hr_zone_current',
  'hr_above_ceiling_duration',
  // derived performance
  'time_in_zone_pct',
  'decoupling',
  'hrr60',
  'rpe_vs_target_delta',
  'pace_pr_trend',
  'load_progression_stalled',
  // plan state
  'sessions_missed',
  'sessions_missed_consecutive',
  'days_behind_plan',
  'pct_plan_completed',
  'days_to_race',
  'is_taper_window',
  // athlete state / selection
  'injury_flag',
  'injury_active',
  'missing_equipment',
  'modality_score',
  'level',
  'goal_type',
  'division',
  'age',
  'sex',
]);
export type ConditionMetric = z.infer<typeof conditionMetric>;

// ── Operators (spec §2) ─────────────────────────────────────────────────────
export const ruleOperator = z.enum([
  '<',
  '<=',
  '=',
  '>=',
  '>',
  'between',
  'trend_down',
  'trend_up',
  'in',
  'is_true',
]);
export type RuleOperator = z.infer<typeof ruleOperator>;

// ── Condition units (spec §2/§3) ────────────────────────────────────────────
export const conditionUnit = z.enum([
  'pct',
  'ms',
  'bpm',
  'h',
  's',
  'scale_1_5',
  'scale_1_10',
  'score_0_100',
  's_per_km',
  's_per_500m',
  'zone_1_5',
  'reps',
  'count',
  'days',
  'points',
  'enum',
  'bool',
]);
export type ConditionUnit = z.infer<typeof conditionUnit>;

// ── Condition source (spec §2) ──────────────────────────────────────────────
export const conditionSource = z.enum([
  'checkin',
  'wearable',
  'live_sensor',
  'logged_set',
  'plan_state',
  'derived',
]);
export type ConditionSource = z.infer<typeof conditionSource>;

// ── Action verbs (spec §3, exhaustive) ──────────────────────────────────────
export const actionVerb = z.enum([
  'keep',
  'skip',
  'swap_session',
  'swap_modality',
  'scale_load',
  'set_load_pct_rm',
  'cut_reps',
  'add_reps',
  'cut_sets',
  'reduce_volume',
  'increase_volume',
  'downgrade_intensity',
  'upgrade_intensity',
  'walk_jog',
  'walk_break',
  'cap_pace',
  'cap_hr',
  'extend_recovery',
  'reschedule',
  'insert_session',
  'remove_session',
  'redistribute_week',
  'deload_week',
  'lower_next_week',
  'progress_next_week',
  'repeat_block',
  'advance_block',
  'forbid_selection',
  'require_swap',
  'cap_intensity',
  'set_emphasis',
  'set_station_loads',
  'select_level_variant',
  'flag_coach',
  'notify_athlete',
  'request_feedback',
  'set_adaptive_flag',
  'no_op_log_only',
]);
export type ActionVerb = z.infer<typeof actionVerb>;

// ── Rule axes (spec §2) ─────────────────────────────────────────────────────
export const ruleTriggerPhase = z.enum([
  'pre_session',
  'intra_session',
  'cross_session',
  'selection',
]);
export type RuleTriggerPhase = z.infer<typeof ruleTriggerPhase>;

export const ruleScope = z.enum([
  'set',
  'exercise',
  'session',
  'day',
  'week',
  'block',
  'global',
]);
export type RuleScope = z.infer<typeof ruleScope>;

export const rulePriority = z.enum(['critical', 'high', 'medium', 'low']);
export type RulePriority = z.infer<typeof rulePriority>;

export const ruleAuthored = z.enum(['coach', 'ai_suggested', 'system_default']);
export type RuleAuthored = z.infer<typeof ruleAuthored>;

// Rule conditions are AND-ed by default; a group {op:'OR'} expresses alternatives
// (spec §2). Modeled as the boolean op a condition group is combined with.
export const conditionGroupOp = z.enum(['AND', 'OR']);
export type ConditionGroupOp = z.infer<typeof conditionGroupOp>;

// Window for temporal aggregation (spec §2 / §2.5 anti-overreaction).
// Free-ish but bounded to known shapes; kept as a string with a soft enum so the
// builder offers the known ones without rejecting a future "last_Nd".
export const KNOWN_WINDOWS = [
  'today',
  'last_7d',
  'last_14d',
  'rep1_vs_rep6',
  'session',
  '2_consecutive',
  '3_consecutive',
] as const;
export type KnownWindow = (typeof KNOWN_WINDOWS)[number];

// ── Severity ordering for conflict resolution (spec §2.2) ───────────────────
// Lower index = more conservative = wins within equal priority. Cross-session
// rewrite verbs first, then intra-session micro-adjusts. Verbs absent here are
// treated as least-severe (informational / no plan rewrite).
export const ACTION_SEVERITY_ORDER: readonly ActionVerb[] = [
  // cross-session, most conservative first
  'skip',
  'reschedule',
  'swap_session',
  'swap_modality',
  'deload_week',
  'reduce_volume',
  'lower_next_week',
  'downgrade_intensity',
  'cap_intensity',
  'cap_hr',
  'cap_pace',
  // intra-session cuts beat load scaling (spec §2.2)
  'cut_reps',
  'cut_sets',
  'walk_jog',
  'walk_break',
  'extend_recovery',
  'scale_load',
  'set_load_pct_rm',
  // progression (least conservative — loses to anything that lowers)
  'add_reps',
  'increase_volume',
  'upgrade_intensity',
  'progress_next_week',
  'advance_block',
  'keep',
];

// Verbs that LOWER load/volume/intensity (used by §2.3 direction-coherence:
// when two rules push opposite, the one that LOWERS wins).
export const LOWERING_VERBS: ReadonlySet<ActionVerb> = new Set<ActionVerb>([
  'skip',
  'reschedule',
  'reduce_volume',
  'cut_reps',
  'cut_sets',
  'downgrade_intensity',
  'lower_next_week',
  'deload_week',
  'cap_intensity',
  'cap_hr',
  'cap_pace',
  'walk_jog',
  'walk_break',
  'extend_recovery',
  'set_emphasis', // direction depends on multiplier; treated neutral by caller
]);

export const RAISING_VERBS: ReadonlySet<ActionVerb> = new Set<ActionVerb>([
  'add_reps',
  'increase_volume',
  'upgrade_intensity',
  'progress_next_week',
  'advance_block',
]);

// Verbs that rewrite the ASSIGNED plan → require coach approval by default
// (spec §2.7). Auto-applicable verbs are the complement.
export const COACH_APPROVAL_VERBS: ReadonlySet<ActionVerb> = new Set<ActionVerb>([
  'skip',
  'swap_session',
  'reschedule',
  'insert_session',
  'remove_session',
  'deload_week',
  'lower_next_week',
  'progress_next_week',
  'repeat_block',
  'advance_block',
  'reduce_volume',
  'increase_volume',
  'set_load_pct_rm',
  'set_station_loads',
]);

// Auto-applicable verbs (spec §2.7): notify, feedback, minor redistribute, and
// intra-session micro-adjusts. Used as the default for `requires_coach_approval`.
export const AUTO_APPLICABLE_VERBS: ReadonlySet<ActionVerb> = new Set<ActionVerb>([
  'notify_athlete',
  'request_feedback',
  'redistribute_week',
  'walk_jog',
  'walk_break',
  'cut_reps',
  'cut_sets',
  'scale_load',
  'extend_recovery',
  'cap_pace',
  'cap_hr',
  'downgrade_intensity',
  'set_adaptive_flag',
  'no_op_log_only',
  'keep',
  'flag_coach',
]);

// Numeric rank for priority comparison (spec §2.1: critical > high > medium > low).
export const PRIORITY_RANK: Record<RulePriority, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

// Numeric rank for scope specificity (spec §2.4: more specific wins at equal
// priority). set is most specific, global least.
export const SCOPE_SPECIFICITY: Record<RuleScope, number> = {
  set: 6,
  exercise: 5,
  session: 4,
  day: 3,
  week: 2,
  block: 1,
  global: 0,
};

// Authored-source rank (spec §2.8: coach > ai_suggested / system_default).
export const AUTHORED_RANK: Record<RuleAuthored, number> = {
  coach: 2,
  ai_suggested: 1,
  system_default: 1,
};
