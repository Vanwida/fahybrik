// Persisted-row zod schemas for the METHODOLOGY SYSTEM tables (migration 0048,
// spec §5). These validate every mutation server-side (project rule) and type the
// rows read back. The rule-ENGINE shapes (Rule/RuleCondition/RuleAction, the
// vocabulary enums, conflict resolver, zone resolver) live in
// @fahybrid/shared/domain/methodology — imported here, NOT re-declared.

import { z } from 'zod';
import { idSchema, isoDateTime } from './_primitives';
import {
  conditionGroupSchema,
  ruleActionSchema,
  rulePriority,
  ruleAuthored,
  ruleScope,
  ruleTriggerPhase,
  ZONE_ROLES,
} from '../domain/methodology/index';

// ── coach_methodology (1 row / coach) — global scalars (spec §4 areas 1,5,6,8,14)
export const coachMethodologySchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  // Zone model (Área 5)
  hr_zone_count: z.number().int().min(3).max(7).default(5),
  hr_anchor: z.enum(['lthr', 'max_hr', 'tanaka']).default('lthr'),
  run_pace_anchor: z.enum(['5k', '10k', '1mile', 'threshold']).default('5k'),
  erg_row_anchor: z.enum(['2k']).default('2k'),
  erg_ski_anchor: z.enum(['1k']).default('1k'),
  bike_anchor: z.enum(['ftp']).default('ftp'),
  rpe_scale: z.enum(['0_10_cr10']).default('0_10_cr10'),
  one_rm_estimation: z.enum(['Epley', 'Brzycki', 'Lombardi']).default('Epley'),
  rpe_to_pct1rm_table_json: z.record(z.string(), z.number()).nullable(),
  // Non-negotiables / spacing (Área 1)
  intensity_spacing_min_hours: z.number().int().min(0).max(48).default(6),
  max_consecutive_hi_days: z.number().int().min(1).max(7).default(1),
  decoupling_target_pct: z.number().min(0).max(100).default(5),
  decoupling_regress_threshold_pct: z.number().min(0).max(100).default(8),
  // Readiness gates (Área 6)
  hrv_skip_threshold_pct: z.number().default(-15),
  hrv_modify_threshold_pct: z.number().default(-10),
  sleep_min_hours: z.number().min(0).max(24).default(6),
  soreness_skip_threshold: z.number().int().min(1).max(5).default(4),
  presession_rpe_skip_threshold: z.number().min(0).max(10).default(5),
  gate_logic: z.enum(['ANY_triggers', 'ALL_triggers']).default('ANY_triggers'),
  // Tests (Área 8)
  recalc_policy: z.enum(['auto_on_result', 'propose_review', 'manual']).default('propose_review'),
  test_cadence_mode: z.enum(['block_start', 'every_n_weeks', 'on_plateau', 'manual']).default('block_start'),
  freshness_1rm_weeks: z.number().int().default(12),
  freshness_pace_hr_weeks: z.number().int().default(6),
  freshness_stations_weeks: z.number().int().default(8),
  // Taper (Área 12)
  taper_duration_days: z.number().int().min(0).max(21).default(7),
  taper_volume_reduction_pct: z.number().min(0).max(100).default(50),
  taper_keep_intensity: z.boolean().default(true),
  // Voice (Área 14)
  tone_motivador: z.number().int().min(0).max(100).default(60),
  tone_tecnico: z.number().int().min(0).max(100).default(80),
  tone_estricto: z.number().int().min(0).max(100).default(50),
  tone_calido: z.number().int().min(0).max(100).default(40),
  why_depth: z.enum(['ninguno', 'una_linea', 'parrafo']).default('una_linea'),
  language_primary: z.enum(['es', 'en']).default('es'),
  language_fallback: z.enum(['es', 'en']).nullable(),
  address_form: z.enum(['tu', 'usted']).default('tu'),
  emoji_use: z.enum(['nunca', 'raro', 'libre']).default('nunca'),
  checkin_feedback_style: z.string().max(120).default('dato+accion'),
  philosophy_narrative: z.string().nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type CoachMethodology = z.infer<typeof coachMethodologySchema>;

// ── methodology_blocks (per coach) — Áreas 2 & 3 ─────────────────────────────
export const methodologyBlockObjective = z.enum([
  'volumen_aerobico',
  'densidad_muscular',
  'umbral_anaerobico',
  'lactate_clearance',
  'pace_consistency',
  'especificidad_carrera',
  'peaking_freshness',
  'mantenimiento_fuerza',
]);
export type MethodologyBlockObjective = z.infer<typeof methodologyBlockObjective>;

export const progressionShape = z.enum(['lineal', 'escalon', 'onda']);
export type ProgressionShape = z.infer<typeof progressionShape>;

export const methodologyBlockSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  block_type: z.string(),
  label_athlete: z.string().min(1).max(60),
  duration_weeks: z.number().int().min(1).max(8),
  objective_json: z.array(methodologyBlockObjective).min(1),
  intensity_ceiling: z.enum(['Z2', 'Z3', 'Z4', 'Z5']),
  sequence_order: z.number().int().min(1),
  progression_shape_volume: progressionShape,
  progression_shape_intensity: progressionShape,
  weekly_volume_delta_pct: z.number().nullable(),
  intensity_ramp_low_pct: z.number().nullable(),
  intensity_ramp_high_pct: z.number().nullable(),
  deload_trigger: z.enum(['every_n_weeks', 'last_week_of_block', 'readiness_based', 'none']),
  deload_volume_reduction_pct: z.number().min(0).max(100),
  deload_intensity_reduction_pct: z.number().min(0).max(100),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type MethodologyBlock = z.infer<typeof methodologyBlockSchema>;

// ── methodology_zones — the per-coach 6-zone OFFSET model (Área 5, migration 0061)
// A zone = identity (code/label/color/role/sort_order) + an offset band in seconds
// from the threshold (test) pace, in pace_unit (per_500m ergo | per_km run). The
// agnostic `role` axis + `ZonePaceUnit` are single-sourced in the domain module.
export const zoneRole = z.enum(ZONE_ROLES);
export const zonePaceUnit = z.enum(['per_500m', 'per_km']);

export const methodologyZoneSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  code: z.string().min(1).max(8), // 'Z1'..'Z6'
  label: z.string().max(60),
  color: z.string().max(40), // token or hex
  role: zoneRole,
  sort_order: z.number().int().min(1).max(12),
  anchor: z.string().max(40).default('threshold'), // what the offsets are measured against
  pace_unit: zonePaceUnit,
  low_offset_s: z.number(), // fast edge, seconds from threshold (negative = faster)
  high_offset_s: z.number().nullable(), // slow edge; null = open (Z1 = +infinity)
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type MethodologyZone = z.infer<typeof methodologyZoneSchema>;

// ── athlete_zone_profiles — VERSIONED resolved zones (migration 0061) ────────
// The single stored source the plan resolver + calculator read: a test threshold
// in + the 6 absolute zone bands snapshot out. Highest version = current.
const ZONE_PROFILE_MODALITY = z.enum(['row', 'ski', 'run', 'bike']);

// Provenance of a stored zone profile. A profile is either AUTO-derived from the
// athlete's onboarding benchmarks ('onboarding_auto', pending coach review),
// recorded from a coach-entered test ('coach_test', validated), or self-entered
// by the athlete from the app ('athlete_test', migration 0070). All three feed
// the SAME resolve+store path; the latest version per modality is current, and a
// coach can always override by recording their own test (a newer version).
export const ZONE_PROFILE_SOURCES = ['coach_test', 'onboarding_auto', 'athlete_test'] as const;
export const zoneProfileSource = z.enum(ZONE_PROFILE_SOURCES);
export type ZoneProfileSource = z.infer<typeof zoneProfileSource>;

// One resolved absolute band inside zones_json. Mirrors ResolvedZone in the domain
// module: absolute seconds per pace_unit; slow_s null = open-ended (Z1).
export const resolvedZoneSnapshotSchema = z.object({
  code: z.string().min(1).max(8),
  label: z.string().max(60),
  color: z.string().max(40),
  role: zoneRole,
  sort_order: z.number().int().min(1).max(12),
  fast_s: z.number().nonnegative(),
  slow_s: z.number().nonnegative().nullable(),
});
export type ResolvedZoneSnapshot = z.infer<typeof resolvedZoneSnapshotSchema>;

export const athleteZoneProfileSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  modality: ZONE_PROFILE_MODALITY,
  threshold_s: z.number().positive(),
  pace_unit: zonePaceUnit,
  source_test_slug: z.string().max(60).nullable(),
  source_benchmark_id: idSchema.nullable(),
  // Provenance + review gate (migration 0066). Defaulted so rows predating the
  // columns (all coach-recorded, already validated) read as confirmed coach tests.
  source: zoneProfileSource.default('coach_test'),
  needs_review: z.boolean().default(false),
  // Exactly the 6 resolved bands (second net behind the DB CHECK).
  zones_json: z.array(resolvedZoneSnapshotSchema).length(6),
  version: z.number().int().min(1),
  recorded_at: isoDateTime,
  created_at: isoDateTime,
});
export type AthleteZoneProfile = z.infer<typeof athleteZoneProfileSchema>;

// ── methodology_tests (coach × test) — Área 8 ────────────────────────────────
export const methodologyTestSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  slug: z.string().min(1).max(60),
  modality: z.string().max(20),
  protocol: z.string().max(400),
  output_field: z.string().max(60), // onboarding field this writes
  feeds_anchor: z.string().max(40).nullable(), // which anchor it calibrates
  cadence: z.string().max(120), // e.g. "block_start" | "every_4_6_weeks"
  freshness_weeks: z.number().int().min(1).max(52),
  recalc_propagation_json: z.array(z.string()).default([]),
  progression_cap_pct: z.number().nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type MethodologyTest = z.infer<typeof methodologyTestSchema>;

// ── methodology_weekly_structure (coach × level) — Área 4 ────────────────────
export const methodologyWeeklyStructureSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  level: z.number().int().min(1).max(4),
  sessions_per_week: z.number().int().min(1).max(14),
  two_a_day_enabled: z.boolean(),
  modality_mix_json: z.record(z.string(), z.number()), // keyed by the coach's microciclo name
  hard_easy_pattern: z.enum(['hard_easy_alt', '2hard_1easy', 'block_undulating']),
  key_session_by_block_json: z.record(z.string(), z.string()), // keyed by the coach's microciclo name
  am_pm_pairs_json: z.array(z.object({ am: z.string(), pm: z.string(), gap_min_h: z.number() })).default([]),
  forbidden_adjacent_json: z.array(z.tuple([z.string(), z.string()])).default([]),
  rest_day_placement: z.enum(['post_hardest', 'mid_week', 'pre_race_sim', 'fixed']),
  min_separation_strength_cardio_h: z.number().int().min(0).max(12),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type MethodologyWeeklyStructure = z.infer<typeof methodologyWeeklyStructureSchema>;

// ── methodology_substitutions (coach × edge) — Área 9 ────────────────────────
export const stimulusMatch = z.enum(['exact', 'high', 'partial']);
export type StimulusMatch = z.infer<typeof stimulusMatch>;

export const methodologySubstitutionSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  target_slug: z.string().min(1).max(80),
  alt_slug: z.string().min(1).max(80),
  stimulus_match: stimulusMatch,
  movement_pattern: z.string().max(40),
  energy_system: z.string().max(40),
  condition: z.enum(['no_equipment', 'injury_area', 'space', 'noise', 'any']),
  injury_area: z.string().max(40).nullable(),
  scale_factor: z.number().min(0).max(3).nullable(),
  flag_coach: z.boolean().default(false),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type MethodologySubstitution = z.infer<typeof methodologySubstitutionSchema>;

// ── methodology_station_strategy (coach × station 1-8) — Área 12 ─────────────
export const methodologyStationStrategySchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  station_position: z.number().int().min(1).max(8),
  station_slug: z.string().max(60),
  time_m_seconds: z.number().int().nullable(),
  time_w_seconds: z.number().int().nullable(),
  load_m_kg: z.number().nullable(),
  load_w_kg: z.number().nullable(),
  fractionation: z.string().max(120).nullable(),
  breathing_cue: z.string().max(200).nullable(),
  level_scaling_json: z.record(z.string(), z.unknown()).default({}),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type MethodologyStationStrategy = z.infer<typeof methodologyStationStrategySchema>;

// ── methodology_nutrition_rules (coach × moment) — Área 13 ───────────────────
export const nutritionMoment = z.enum([
  'pre_endurance',
  'post_glycogen',
  'post_strength',
  'post_threshold',
  'between_am_pm_strength_endurance',
  'between_am_pm_pm_recovery',
  'post_recovery_evening',
  'race_morning',
  'intra_race',
]);
export type NutritionMoment = z.infer<typeof nutritionMoment>;

export const methodologyNutritionRuleSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  moment: nutritionMoment,
  carbs_g_per_kg: z.number().min(0).max(15).nullable(),
  carbs_g_abs_low: z.number().int().nullable(),
  carbs_g_abs_high: z.number().int().nullable(),
  protein_g_per_kg: z.number().min(0).max(5).nullable(),
  protein_g_abs: z.number().int().nullable(),
  carb_protein_ratio: z.string().max(12).nullable(), // "3:1"
  timing_minutes: z.number().int().nullable(),
  hydration: z.boolean().default(false),
  electrolytes: z.boolean().default(false),
  note: z.string().max(400).nullable(),
  authored: ruleAuthored.default('coach'),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type MethodologyNutritionRule = z.infer<typeof methodologyNutritionRuleSchema>;

// ── methodology_rules (the ENGINE) — typed axes as columns + JSONB arity ─────
// conditions/actions reuse the domain schemas (single source). The DB row mirrors
// this: scalar axes are columns, conditions_json/actions_json are JSONB.
export const methodologyRuleRowSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  area: z.number().int().min(1).max(14),
  trigger_phase: ruleTriggerPhase,
  scope: ruleScope,
  priority: rulePriority,
  authored: ruleAuthored,
  source_template_id: idSchema.nullable(),
  source_excerpt: z.string().max(2000).nullable(),
  requires_coach_approval: z.boolean(),
  enabled: z.boolean().default(true),
  conditions_json: z.array(conditionGroupSchema).min(1),
  actions_json: z.array(ruleActionSchema).min(1),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type MethodologyRuleRow = z.infer<typeof methodologyRuleRowSchema>;

// ── athlete_emphasis (athlete × group) — Área 10 (per-athlete STATE) ─────────
export const athleteEmphasisSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  methodology_group_id: z.number().int().min(1).max(10),
  multiplier: z.number().min(0.5).max(2.0),
  modality_profile_json: z.record(z.string(), z.number()).nullable(), // {run:4,strength:2,...}
  source: ruleAuthored.default('ai_suggested'),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type AthleteEmphasis = z.infer<typeof athleteEmphasisSchema>;
