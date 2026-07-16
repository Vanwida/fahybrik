// Athlete intake server logic. Implements the 5-step Pablo handoff defined in
// /docs/ux/11-coach-athlete-intake.md.
//
// Public surface:
//   - listPendingIntake({ coach_id })
//   - loadIntakeProfile({ athlete_id, coach_id }) → full profile + auto-suggestions
//   - commitIntake({ athlete_id, coach_id, payload }) → atomic commit:
//       persists macrocycle (via computeMacrocycle), records intake snapshot,
//       schedules baseline tests, sends welcome message.
//
// Strict separation from cohort.ts / atr/service.ts: this module *uses* their
// public functions but does not duplicate their logic.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { joinCoachOverride } from '@/lib/exercises/coach-override';
import {
  composeWelcomeDraft,
  detectBenchmarkOutliers,
  explainLevel,
  inferLevel,
  proposeBlockSpecs,
  recommendBaselineTests,
} from './intake-suggestions';
import { proposeBlockEmphasis, type BlockEmphasis } from './intake-suggestions';
import { suggestAthleteTrainingLevel } from './athlete-training-level';
import { getTargetRaceRow } from '@fahybrid/shared/domain/coach/target-race';
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
  BENCH_RUN_MARATHON,
  BENCH_ROW_2K,
  BENCH_SKI_1K,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import {
  deriveTrainingDaysPerWeek,
  injuryContraindications,
  missingEquipmentTags,
  parseActiveInjuries,
  parseAvailability,
  parseEquipment,
  parsePreferredWeek,
  programDays,
  type EquipmentSlug,
  type InjuryContraindication,
} from '@fahybrid/shared/domain/coach/intake-availability';
import {
  intakeCommitSchema,
  type AthleteLevel,
  type IntakeBaselineTest,
  type IntakeBlockSpec,
  type IntakeCommit,
  type IntakeNotesSnapshot,
} from './intake-schema';

// Number of days per microcycle (week). Local mirror of the assign-draft route
// constant so first-block weeks are stepped identically.
const DAYS_PER_WEEK = 7;

// Re-export pure helpers for callers / tests.
export {
  composeWelcomeDraft,
  detectBenchmarkOutliers,
  explainLevel,
  inferLevel,
  proposeBlockSpecs,
  recommendBaselineTests,
};

// =============================================================================
// Types surfaced to API + UI
// =============================================================================

export interface PendingIntakeAthlete {
  athlete_id: string;
  full_name: string;
  onboarded_at: string; // ISO
  hours_since_onboarded: number;
  a_event_iso: string | null;
  a_event_name: string | null;
}

export interface IntakeProfile {
  athlete: {
    athlete_id: string;
    user_id: string;
    full_name: string;
    onboarded_at: string | null;
    intake_completed_at: string | null;
    age: number | null;
    sex: 'male' | 'female' | 'other' | null;
    height_cm: number | null;
    weight_kg: number | null;
    body_fat_pct: number | null;
    handedness: 'right' | 'left' | null;
    training_experience_years: number | null;
    primary_discipline: string | null;
    training_days_per_week: number | null;
    equipment_access: string | null;
    twice_daily_capable: boolean | null;
    am_window: string | null;
    pm_window: string | null;
    squad_notes: string | null;
    nutrition_notes: string | null;
    coaching_history: string | null;
    /** Step 9 — goal narrative + viability self-report (0047 athletes.* columns). */
    goal_short: string | null;
    goal_mid: string | null;
    goal_long: string | null;
    achievable_2_4_months: 'yes' | 'no' | 'unknown' | null;
    biggest_obstacle: string | null;
    /** 1-10 — how much the athlete feels the outcome depends on them. */
    pct_depends_on_me: number | null;
    coach_role: string | null;
    injuries: Array<{
      area: string;
      /** Step 4 injury type (e.g. tendinopatía, esguince) — kept verbatim from onboarding. */
      type?: string;
      severity?: 'mild' | 'moderate' | 'severe';
      notes?: string;
      active: boolean;
    }>;
  };
  benchmarks: Array<{
    exercise_slug: string;
    label: string;
    value: number;
    unit: string;
    recorded_at: string;
    group: BenchmarkGroup;
  }>;
  race_history: Array<{
    name: string;
    // null for an official single-URL import with no machine date (0072).
    iso_date: string | null;
    division: string | null;
    finish_time: string | null;
    /** A/B/C role in the periodization (0046 races.priority). */
    priority: 'target' | 'secondary' | 'tune_up' | null;
    /** Athlete's goal time in seconds, if set (0046 races.goal_time_seconds). */
    goal_time_seconds: number | null;
    event_type: 'hyrox' | 'deka' | 'other' | null;
    format: 'singles' | 'doubles' | 'relay' | null;
  }>;
  devices: Array<{ type: string; display_name: string | null }>;
  target_event: {
    event_id: string;
    name: string;
    iso_date: string;
    division: string | null;
    days_to_event: number;
    is_in_past: boolean;
  } | null;
  goal_notes: string | null;
  /** 0047 structured intake answers, parsed + the derived planner inputs. */
  intake_structured: IntakeStructured;
  suggestions: IntakeSuggestions;
  warnings: IntakeWarning[];
}

export interface IntakeStructured {
  goal_type: import('./intake-suggestions').GoalType | null;
  run_experience: import('./intake-suggestions').RunExperience | null;
  strength_experience: import('./intake-suggestions').StrengthExperience | null;
  sleep_quality: number | null;
  stress_level: number | null;
  commitment_level: number | null;
  /** Weekday keys (mon..sun) the athlete marked as `program` (Step 5). */
  program_days: string[];
  /** Step 5 raw per-day availability map (mon..sun → program|other_activity|rest). */
  availability: Record<string, 'program' | 'other_activity' | 'rest'>;
  /** Step 5 training-window start (local time, HH:MM) — null if not declared. */
  available_from: string | null;
  /** Step 5 training-window end (local time, HH:MM) — null if not declared. */
  available_to: string | null;
  /** Step 5 typical session length in minutes. */
  session_minutes: number | null;
  /** Step 5 whether the weekly schedule can flex. */
  schedule_flexible: boolean | null;
  /** Step 7 facility kind (other → facility_other_text). */
  facility_type:
    | 'commercial_gym'
    | 'crossfit_box'
    | 'multiple'
    | 'other'
    | null;
  facility_other_text: string | null;
  /** Step 7 access to an athletics track. */
  has_track: boolean | null;
  /** Step 7 access to flat running terrain. */
  has_flat_run: boolean | null;
  /** Step 6 preferred day-type layout. */
  preferred_week: Record<string, string[]>;
  /** Step 7 owned equipment slugs. */
  owned_equipment: string[];
  /** Specialized exercise-equipment tags the athlete lacks. */
  missing_equipment_tags: string[];
  /** # of coach-catalog exercises needing a machine the athlete lacks. */
  equipment_incompatible_count: number;
  /** Step 4 active-injury movement contraindications. */
  injury_contraindications: InjuryContraindication[];
}

export interface IntakeSuggestions {
  block_specs: IntakeBlockSpec[];
  level: AthleteLevel;
  level_rationale: string;
  baseline_tests: IntakeBaselineTest[];
  welcome_draft: string;
  total_days: number;
  is_compressive: boolean;
  /** Step 2 → macro emphasis (which axis to weight; advisory, Pablo overrides). */
  block_emphasis: BlockEmphasis;
}

export interface IntakeWarning {
  kind:
    | 'onboarding_incomplete'
    | 'a_event_close'
    | 'a_event_invalid'
    | 'benchmarks_outliers'
    | 'active_injury'
    | 'equipment_gap'
    | 'low_readiness_self_report';
  severity: 'warning' | 'critical';
  label: string;
  detail: string;
}

type BenchmarkGroup =
  | 'one_rm'
  | 'endurance'
  | 'hyrox_station'
  | 'anaerobic_threshold'
  | 'other';

export interface CommitResult {
  athlete_id: string;
  /** Id of the first microciclo (month assignment) materialized at intake, or null. */
  macrocycle_id: string | null;
  scheduled_assignments: number;
  month_assignment_count?: number;
  welcome_sent: boolean;
  /**
   * First microciclo materialized IN DRAFT on commit (default path), from the
   * coach's first month template. `null` when a month template was explicitly
   * assigned instead, or when the coach has no month templates yet (degraded: no
   * draft — the coach programs the first microciclo manually).
   */
  first_block_draft?: {
    /** Microciclo NAME (coach data). */
    block_type: string;
    start_date: string;
    week_count: number;
    week_starts: string[];
    assignment_count: number;
  } | null;
}

export class IntakeError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'IntakeError';
  }
}

// =============================================================================
// Pending intake list
// =============================================================================

export async function listPendingIntake(params: {
  coach_id: bigint | number;
  client?: Sql;
}): Promise<PendingIntakeAthlete[]> {
  const client = params.client ?? defaultSql;
  const rows = await client<
    Array<{
      athlete_id: string;
      full_name: string;
      onboarded_at: Date;
      a_event_iso: string | null;
      a_event_name: string | null;
    }>
  >`
    select
      a.id::text                                      as athlete_id,
      a.full_name                                     as full_name,
      a.onboarded_at                                  as onboarded_at,
      to_char(e.start_date, 'YYYY-MM-DD')             as a_event_iso,
      e.name                                          as a_event_name
    from athletes a
    left join lateral (
      -- Target race = soonest upcoming race with priority='target' (unified spine).
      select r.race_date as start_date, r.name
      from races r
      where r.athlete_id = a.id
        and r.priority = 'target'
        and r.race_date >= current_date
        and r.status in ('planned', 'registered')
      order by r.race_date asc
      limit 1
    ) e on true
    where a.coach_id = ${params.coach_id as number}
      and a.intake_completed_at is null
      and a.onboarded_at is not null
    order by a.onboarded_at asc
  `;

  const now = Date.now();
  return rows.map((r) => ({
    athlete_id: r.athlete_id,
    full_name: r.full_name,
    onboarded_at: r.onboarded_at.toISOString(),
    hours_since_onboarded: Math.max(0, Math.floor((now - r.onboarded_at.getTime()) / 3_600_000)),
    a_event_iso: r.a_event_iso,
    a_event_name: r.a_event_name,
  }));
}

// =============================================================================
// Profile load + auto-suggestions
// =============================================================================

export async function loadIntakeProfile(params: {
  athlete_id: bigint | number;
  coach_id: bigint | number;
  now?: Date;
  client?: Sql;
}): Promise<IntakeProfile> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();

  const athleteRows = await client<
    Array<{
      athlete_id: string;
      user_id: string;
      full_name: string;
      dob: string | null;
      sex: 'male' | 'female' | 'other' | null;
      height_cm: number | null;
      weight_kg: number | null;
      body_fat_pct: number | null;
      training_experience_years: number | null;
      primary_discipline: string | null;
      training_days_per_week: number | null;
      equipment_access: string | null;
      injuries_json: unknown;
      onboarded_at: Date | null;
      intake_completed_at: Date | null;
      intake_notes_json: unknown;
      coach_id: string | null;
      // 0047 structured intake fields (Steps 2-7).
      goal_type: string | null;
      run_experience: string | null;
      strength_experience: string | null;
      sleep_quality: number | null;
      stress_level: number | null;
      commitment_level: number | null;
      availability_json: unknown;
      preferred_week_json: unknown;
      equipment_json: unknown;
      // 0047 Step 5 availability detail.
      available_from: string | null;
      available_to: string | null;
      session_minutes: number | null;
      schedule_flexible: boolean | null;
      // 0047 Step 7 facility.
      facility_type: string | null;
      facility_other_text: string | null;
      has_track: boolean | null;
      has_flat_run: boolean | null;
      // 0047 Step 9 goal narrative.
      goal_short: string | null;
      goal_mid: string | null;
      goal_long: string | null;
      achievable_2_4_months: string | null;
      biggest_obstacle: string | null;
      pct_depends_on_me: number | null;
      coach_role: string | null;
    }>
  >`
    select
      a.id::text                          as athlete_id,
      a.user_id::text                     as user_id,
      a.full_name                         as full_name,
      to_char(a.dob, 'YYYY-MM-DD')        as dob,
      a.sex::text                         as sex,
      a.height_cm                         as height_cm,
      a.weight_kg                         as weight_kg,
      a.body_fat_pct                      as body_fat_pct,
      a.training_experience_years         as training_experience_years,
      a.primary_discipline::text          as primary_discipline,
      a.training_days_per_week            as training_days_per_week,
      a.equipment_access::text            as equipment_access,
      a.injuries_json                     as injuries_json,
      a.onboarded_at                      as onboarded_at,
      a.intake_completed_at               as intake_completed_at,
      a.intake_notes_json                 as intake_notes_json,
      a.coach_id::text                    as coach_id,
      a.goal_type::text                   as goal_type,
      a.run_experience::text              as run_experience,
      a.strength_experience::text         as strength_experience,
      a.sleep_quality                     as sleep_quality,
      a.stress_level                      as stress_level,
      a.commitment_level                  as commitment_level,
      a.availability_json                 as availability_json,
      a.preferred_week_json               as preferred_week_json,
      a.equipment_json                    as equipment_json,
      to_char(a.available_from, 'HH24:MI') as available_from,
      to_char(a.available_to,   'HH24:MI') as available_to,
      a.session_minutes                   as session_minutes,
      a.schedule_flexible                 as schedule_flexible,
      a.facility_type::text               as facility_type,
      a.facility_other_text               as facility_other_text,
      a.has_track                         as has_track,
      a.has_flat_run                      as has_flat_run,
      a.goal_short                        as goal_short,
      a.goal_mid                          as goal_mid,
      a.goal_long                         as goal_long,
      a.achievable_2_4_months::text       as achievable_2_4_months,
      a.biggest_obstacle                  as biggest_obstacle,
      a.pct_depends_on_me                 as pct_depends_on_me,
      a.coach_role                        as coach_role
    from athletes a
    where a.id = ${params.athlete_id as number}
    limit 1
  `;
  const a = athleteRows[0];
  if (!a) {
    throw new IntakeError('not_found', `athlete ${params.athlete_id} not found`, 404);
  }
  if (a.coach_id !== String(params.coach_id)) {
    throw new IntakeError('forbidden', 'athlete is not assigned to this coach', 403);
  }

  // Benchmarks: latest value per exercise_slug.
  const benchRows = await client<
    Array<{
      exercise_slug: string;
      value: number;
      unit: string;
      recorded_at: Date;
      label: string | null;
    }>
  >`
    select distinct on (ab.exercise_slug)
      ab.exercise_slug,
      ab.value::float as value,
      ab.unit,
      ab.recorded_at,
      -- Coach's renamed exercise wins over the base catalog name (mig 0132) —
      -- this label is DISPLAYED in the intake profile, not matched on. The
      -- base-only identity join below is untouched: it's what PICKS the row
      -- (a benchmark slug is a global identity, never a coach's own exercise);
      -- the override join only changes what NAME we show for that same row.
      coalesce(ceo.name, e.name) as label
    from athlete_benchmarks ab
    -- Benchmark label lookup by BASE-catalog identity only (never a coach's
    -- own exercise) — the slug is a global benchmark identity, not scoped.
    left join exercises e on e.slug = ab.exercise_slug and e.coach_id is null
    ${joinCoachOverride(client, params.coach_id)}
    where ab.athlete_id = ${params.athlete_id as number}
    order by ab.exercise_slug, ab.recorded_at desc
  `;

  const benchmarks = benchRows.map((b) => ({
    exercise_slug: b.exercise_slug,
    label: b.label ?? humanize(b.exercise_slug),
    value: b.value,
    unit: b.unit,
    recorded_at: b.recorded_at.toISOString(),
    group: classifyBenchmark(b.exercise_slug),
  }));

  // Target race = soonest upcoming race with priority='target' (unified spine).
  const targetRace = await getTargetRaceRow(params.athlete_id, client);
  let target_event: IntakeProfile['target_event'] = null;
  if (targetRace) {
    target_event = {
      // The "target event" is now the target RACE. event_id carries the race id
      // (always present); the catalog link races.event_id is optional (phase 2).
      event_id: String(targetRace.race_id),
      name: targetRace.name,
      iso_date: targetRace.race_date,
      division: targetRace.division,
      days_to_event: targetRace.days_until,
      // getTargetRaceRow only returns upcoming target races — never in the past.
      is_in_past: false,
    };
  }

  // Devices.
  const deviceRows = await client<Array<{ type: string; display_name: string | null }>>`
    select type::text as type, display_name
    from devices
    where athlete_id = ${params.athlete_id as number}
    order by last_seen_at desc nulls last, id desc
  `;

  // Race history — the athlete's own race entries (0046 races table). Ordered
  // soonest-first; carries each row's periodization role + goal time so the
  // coach can read target vs tune-up.
  const raceRows = await client<
    Array<{
      name: string;
      iso_date: string | null;
      division: string | null;
      priority: string | null;
      goal_time_seconds: number | null;
      result_time_seconds: number | null;
      event_type: string | null;
      format: string | null;
    }>
  >`
    select
      r.name                                  as name,
      to_char(r.race_date, 'YYYY-MM-DD')      as iso_date,
      r.division::text                        as division,
      r.priority::text                        as priority,
      r.goal_time_seconds                     as goal_time_seconds,
      r.result_time_seconds                   as result_time_seconds,
      r.event_type::text                      as event_type,
      r.format::text                          as format
    from races r
    where r.athlete_id = ${params.athlete_id as number}
    order by r.race_date asc
  `;
  const race_history: IntakeProfile['race_history'] = raceRows.map((r) => ({
    name: r.name,
    iso_date: r.iso_date,
    division: r.division,
    finish_time: r.result_time_seconds != null ? formatHms(r.result_time_seconds) : null,
    priority:
      r.priority === 'target' || r.priority === 'secondary' || r.priority === 'tune_up'
        ? r.priority
        : null,
    goal_time_seconds: r.goal_time_seconds,
    event_type:
      r.event_type === 'hyrox' || r.event_type === 'deka' || r.event_type === 'other'
        ? r.event_type
        : null,
    format:
      r.format === 'singles' || r.format === 'doubles' || r.format === 'relay'
        ? r.format
        : null,
  }));

  const injuries = parseInjuries(a.injuries_json);
  const age = a.dob ? computeAge(a.dob, now) : null;

  // 0047 structured intake → planner inputs.
  const availability = parseAvailability(a.availability_json);
  const preferredWeek = parsePreferredWeek(a.preferred_week_json);
  const ownedEquipment = parseEquipment(a.equipment_json);
  const goalContext = {
    goal_type: parseGoalType(a.goal_type),
    run_experience: parseRunExperience(a.run_experience),
    strength_experience: parseStrengthExperience(a.strength_experience),
  };

  // training_days_per_week DERIVED from availability when declared (Step 5 is
  // the source of truth); else fall back to the stored self-declared value.
  const availabilityDays = deriveTrainingDaysPerWeek(availability);
  const effectiveTrainingDays = availabilityDays ?? a.training_days_per_week;

  // Step 7 — equipment compatibility: count this coach's catalog exercises that
  // require a specialized machine the athlete lacks (skierg/rower/sled/bike).
  const equipmentReview = await buildEquipmentReview({
    client,
    coach_id: params.coach_id,
    owned: ownedEquipment,
  });

  // Step 4 — active-injury contraindications surfaced to the coach.
  const injury_contraindications = injuryContraindications(
    parseActiveInjuries(a.injuries_json),
  );

  // Step 2 — macro emphasis from goal + run/strength relationship.
  const block_emphasis = proposeBlockEmphasis(goalContext);

  // Did the athlete actually submit intake answers? Mirrors the evidence the
  // "Respuestas del atleta" panel renders (objetivos / experiencia / estado
  // basal / benchmarks). Drives an honest welcome draft.
  const has_intake_data = Boolean(
    goalContext.goal_type ||
      goalContext.run_experience ||
      goalContext.strength_experience ||
      a.goal_short ||
      a.goal_mid ||
      a.goal_long ||
      a.training_experience_years != null ||
      a.sleep_quality != null ||
      a.stress_level != null ||
      a.commitment_level != null ||
      benchmarks.length > 0,
  );

  // Compute auto-suggestions.
  const suggestions = buildSuggestions({
    target_event,
    benchmarks,
    training_experience_years: a.training_experience_years,
    full_name: a.full_name,
    sex: a.sex,
    now,
    onboarding_training_level: parseOnboardingTrainingLevel(a.intake_notes_json),
    hours_per_week: parseOnboardingHoursPerWeek(a.intake_notes_json),
    goal: goalContext,
    block_emphasis,
    has_intake_data,
  });

  const warnings = buildWarnings({
    target_event,
    benchmarks,
    training_days_per_week: effectiveTrainingDays,
    height_cm: a.height_cm,
    weight_kg: a.weight_kg,
    injuries,
    injury_contraindications,
    equipment_incompatible_count: equipmentReview.incompatible_exercise_count,
    missing_equipment_tags: equipmentReview.missing_tags,
    sleep_quality: a.sleep_quality,
    stress_level: a.stress_level,
  });

  return {
    athlete: {
      athlete_id: a.athlete_id,
      user_id: a.user_id,
      full_name: a.full_name,
      onboarded_at: a.onboarded_at?.toISOString() ?? null,
      intake_completed_at: a.intake_completed_at?.toISOString() ?? null,
      age,
      sex: a.sex,
      height_cm: a.height_cm != null ? Number(a.height_cm) : null,
      weight_kg: a.weight_kg != null ? Number(a.weight_kg) : null,
      body_fat_pct: a.body_fat_pct != null ? Number(a.body_fat_pct) : null,
      handedness: null, // not in athletes table — surfaced from onboarding payload if/when added
      training_experience_years:
        a.training_experience_years != null ? Number(a.training_experience_years) : null,
      primary_discipline: a.primary_discipline,
      training_days_per_week: effectiveTrainingDays,
      equipment_access: a.equipment_access,
      twice_daily_capable: null,
      am_window: null,
      pm_window: null,
      squad_notes: null,
      nutrition_notes: null,
      coaching_history: null,
      goal_short: a.goal_short,
      goal_mid: a.goal_mid,
      goal_long: a.goal_long,
      achievable_2_4_months: parseGoalAchievable(a.achievable_2_4_months),
      biggest_obstacle: a.biggest_obstacle,
      pct_depends_on_me: a.pct_depends_on_me != null ? Number(a.pct_depends_on_me) : null,
      coach_role: a.coach_role,
      injuries: injuries.map((inj) => ({
        area: inj.area,
        type: inj.type,
        severity: inj.severity,
        notes: inj.notes,
        active: inj.active ?? true,
      })),
    },
    benchmarks,
    race_history,
    devices: deviceRows,
    target_event,
    goal_notes: null,
    intake_structured: {
      goal_type: goalContext.goal_type,
      run_experience: goalContext.run_experience,
      strength_experience: goalContext.strength_experience,
      sleep_quality: a.sleep_quality,
      stress_level: a.stress_level,
      commitment_level: a.commitment_level,
      program_days: programDays(availability),
      availability,
      available_from: a.available_from,
      available_to: a.available_to,
      session_minutes: a.session_minutes != null ? Number(a.session_minutes) : null,
      schedule_flexible: a.schedule_flexible,
      facility_type: parseFacilityType(a.facility_type),
      facility_other_text: a.facility_other_text,
      has_track: a.has_track,
      has_flat_run: a.has_flat_run,
      preferred_week: preferredWeek,
      owned_equipment: ownedEquipment,
      missing_equipment_tags: equipmentReview.missing_tags,
      equipment_incompatible_count: equipmentReview.incompatible_exercise_count,
      injury_contraindications,
    },
    suggestions,
    warnings,
  };
}

// =============================================================================
// 0047 structured-intake helpers (enum parsers + equipment review)
// =============================================================================

function parseGoalType(v: string | null): import('./intake-suggestions').GoalType | null {
  return v === 'first_hyrox' ||
    v === 'improve_hyrox_mark' ||
    v === 'improve_running' ||
    v === 'complete_fun' ||
    v === 'other'
    ? v
    : null;
}
function parseRunExperience(v: string | null): import('./intake-suggestions').RunExperience | null {
  return v === 'enthusiast' || v === 'comfortable' || v === 'reluctant' || v === 'none' ? v : null;
}
function parseStrengthExperience(
  v: string | null,
): import('./intake-suggestions').StrengthExperience | null {
  return v === 'loves_lifting' || v === 'weekly_ish' || v === 'with_guidance' || v === 'none'
    ? v
    : null;
}
function parseGoalAchievable(v: string | null): 'yes' | 'no' | 'unknown' | null {
  return v === 'yes' || v === 'no' || v === 'unknown' ? v : null;
}
function parseFacilityType(
  v: string | null,
): 'commercial_gym' | 'crossfit_box' | 'multiple' | 'other' | null {
  return v === 'commercial_gym' || v === 'crossfit_box' || v === 'multiple' || v === 'other'
    ? v
    : null;
}

/**
 * Count exercises in THIS coach's catalog that require a specialized machine the
 * athlete declared they DON'T have (skierg/rower/sled/bike). Surfaces a
 * substitution heads-up — it does NOT block assignment (Pablo substitutes).
 * Returns 0 when the athlete owns everything gated or declared no equipment.
 */
async function buildEquipmentReview(params: {
  client: Sql;
  coach_id: bigint | number;
  owned: EquipmentSlug[];
}): Promise<{ missing_tags: string[]; incompatible_exercise_count: number }> {
  const missing = missingEquipmentTags(params.owned);
  // Athlete declared no equipment at all → we have no signal; don't flag.
  if (params.owned.length === 0 || missing.length === 0) {
    return { missing_tags: missing, incompatible_exercise_count: 0 };
  }

  const rows = await params.client<Array<{ n: number }>>`
    select count(distinct e.id)::int as n
    from template_segments ts
    join templates t on t.id = ts.template_id
    join exercises e on e.id = ts.exercise_id
    where t.coach_id = ${params.coach_id as number}
      and e.equipment && ${missing}::text[]
  `;
  return {
    missing_tags: missing,
    incompatible_exercise_count: rows[0]?.n ?? 0,
  };
}

// =============================================================================
// Auto-suggestions
// =============================================================================

interface BuildSuggestionsParams {
  target_event: IntakeProfile['target_event'];
  benchmarks: IntakeProfile['benchmarks'];
  training_experience_years: number | null;
  full_name: string;
  sex: 'male' | 'female' | 'other' | null;
  now: Date;
  onboarding_training_level: AthleteLevel | null;
  hours_per_week: number | null;
  goal: {
    goal_type: import('./intake-suggestions').GoalType | null;
    run_experience: import('./intake-suggestions').RunExperience | null;
    strength_experience: import('./intake-suggestions').StrengthExperience | null;
  };
  block_emphasis: BlockEmphasis;
  /** True when the athlete actually submitted intake answers (drives an honest
   *  welcome draft — no "he revisado tu perfil" when there is nothing to review). */
  has_intake_data: boolean;
}

function parseOnboardingTrainingLevel(notes: unknown): AthleteLevel | null {
  if (!notes || typeof notes !== 'object') return null;
  const root = notes as Record<string, unknown>;
  const direct = root.suggested_training_level;
  if (direct === 1 || direct === 2 || direct === 3 || direct === 4) return direct;
  const onboarding = root.onboarding;
  if (onboarding && typeof onboarding === 'object') {
    const level = (onboarding as Record<string, unknown>).training_level;
    if (level === 1 || level === 2 || level === 3 || level === 4) return level;
  }
  return null;
}

function parseOnboardingHoursPerWeek(notes: unknown): number | null {
  if (!notes || typeof notes !== 'object') return null;
  const onboarding = (notes as Record<string, unknown>).onboarding;
  if (!onboarding || typeof onboarding !== 'object') return null;
  const hours = (onboarding as Record<string, unknown>).hours_per_week;
  return typeof hours === 'number' ? hours : null;
}

function buildSuggestions(params: BuildSuggestionsParams): IntakeSuggestions {
  const total_days = params.target_event && !params.target_event.is_in_past
    ? params.target_event.days_to_event
    : 12 * 7; // fallback: 12 weeks if no valid event
  const block_specs = proposeBlockSpecs(total_days);
  const totalProposedDays = block_specs.reduce((s, b) => s + b.weeks * 7, 0);
  const is_compressive = total_days > 0 && total_days < 8 * 7; // <8 weeks compresses

  const suggestionBench = params.benchmarks.map((b) => ({
    exercise_slug: b.exercise_slug,
    label: b.label,
    value: b.value,
    unit: b.unit,
  }));

  const levelFromOnboarding = params.onboarding_training_level;
  const inferred = inferLevel({
    benchmarks: suggestionBench,
    training_experience_years: params.training_experience_years,
    goal: params.goal,
  });
  const levelSuggestion = suggestAthleteTrainingLevel({
    athlete_level: levelFromOnboarding,
    weekly_hours: params.hours_per_week,
    hyrox_experience: null,
    self_declared_elite_signals: levelFromOnboarding === 4,
  });
  const level: AthleteLevel = levelFromOnboarding ?? inferred;

  const baseline_tests = recommendBaselineTests({
    benchmarks: suggestionBench,
    is_compressive,
  });

  const welcome_draft = composeWelcomeDraft({
    full_name: params.full_name,
    sex: params.sex,
    target_event: params.target_event
      ? { name: params.target_event.name, is_in_past: params.target_event.is_in_past }
      : null,
    is_compressive,
    has_intake_data: params.has_intake_data,
  });

  return {
    block_specs,
    level,
    level_rationale:
      levelFromOnboarding != null
        ? levelSuggestion.reasons.join(' · ')
        : explainLevel(level, {
            training_experience_years: params.training_experience_years,
            benchmarks: suggestionBench,
            division: params.target_event?.division ?? null,
          }),
    baseline_tests,
    welcome_draft,
    total_days: totalProposedDays,
    is_compressive,
    block_emphasis: params.block_emphasis,
  };
}


// =============================================================================
// Warnings
// =============================================================================

interface BuildWarningsParams {
  target_event: IntakeProfile['target_event'];
  benchmarks: IntakeProfile['benchmarks'];
  training_days_per_week: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  injuries: ReturnType<typeof parseInjuries>;
  injury_contraindications: InjuryContraindication[];
  equipment_incompatible_count: number;
  missing_equipment_tags: string[];
  sleep_quality: number | null;
  stress_level: number | null;
}

// Low sleep or high stress at intake is a load-calibration flag (we run softer
// the first weeks). 1-10 scales; thresholds are deliberately conservative.
const LOW_SLEEP_THRESHOLD = 4;
const HIGH_STRESS_THRESHOLD = 7;

function buildWarnings(params: BuildWarningsParams): IntakeWarning[] {
  const out: IntakeWarning[] = [];

  if (!params.target_event) {
    out.push({
      kind: 'a_event_invalid',
      severity: 'critical',
      label: 'Sin A-event configurado',
      detail: 'Asigna un evento prioridad A antes de cerrar intake',
    });
  } else if (params.target_event.is_in_past) {
    out.push({
      kind: 'a_event_invalid',
      severity: 'critical',
      label: 'A-event en el pasado',
      detail: 'Reasigna fecha o elige otro evento',
    });
  } else if (params.target_event.days_to_event <= 30) {
    out.push({
      kind: 'a_event_close',
      severity: 'warning',
      label: `<30d para A-event (${params.target_event.days_to_event}d)`,
      detail: 'Plan compresivo, revisa viabilidad',
    });
  }

  const onboardingMissing: string[] = [];
  if (params.training_days_per_week == null) onboardingMissing.push('días/sem');
  if (params.height_cm == null) onboardingMissing.push('altura');
  if (params.weight_kg == null) onboardingMissing.push('peso');
  if (params.benchmarks.length === 0) onboardingMissing.push('benchmarks');
  if (onboardingMissing.length > 0) {
    out.push({
      kind: 'onboarding_incomplete',
      severity: 'warning',
      label: 'Onboarding incompleto',
      detail: `Faltan: ${onboardingMissing.join(', ')}`,
    });
  }

  const outliers = detectBenchmarkOutliers(params.benchmarks);
  if (outliers.length > 0) {
    out.push({
      kind: 'benchmarks_outliers',
      severity: 'warning',
      label: '1RMs reportados altos',
      detail: `Validar primera semana con tests (${outliers.join(', ')})`,
    });
  }

  const activeInjuries = params.injuries.filter((i) => i.active !== false);
  if (activeInjuries.length > 0) {
    // Surface the per-area movement contraindications (Step 4) so the coach sees
    // WHAT to avoid, not just that an injury exists.
    const detail =
      params.injury_contraindications.length > 0
        ? params.injury_contraindications
            .map((c) => `${c.area} → evita ${c.flag}`)
            .join(' | ')
        : activeInjuries.map((i) => i.area).join(', ');
    out.push({
      kind: 'active_injury',
      severity: 'warning',
      label: `${activeInjuries.length} lesión activa — contraindicaciones`,
      detail,
    });
  }

  // Step 7 — equipment gap: catalog exercises need a machine the athlete lacks.
  if (params.equipment_incompatible_count > 0) {
    out.push({
      kind: 'equipment_gap',
      severity: 'warning',
      label: `${params.equipment_incompatible_count} ejercicios necesitan material que no tiene`,
      detail: `Sustituir segmentos con: ${params.missing_equipment_tags.join(', ')}`,
    });
  }

  // Step 3 — sleep/stress load-calibration flag.
  const loadFlags: string[] = [];
  if (params.sleep_quality != null && params.sleep_quality <= LOW_SLEEP_THRESHOLD) {
    loadFlags.push(`sueño ${params.sleep_quality}/10`);
  }
  if (params.stress_level != null && params.stress_level >= HIGH_STRESS_THRESHOLD) {
    loadFlags.push(`estrés ${params.stress_level}/10`);
  }
  if (loadFlags.length > 0) {
    out.push({
      kind: 'low_readiness_self_report',
      severity: 'warning',
      label: 'Estado basal comprometido',
      detail: `${loadFlags.join(', ')} → arrancar con carga conservadora`,
    });
  }

  return out;
}

// =============================================================================
// Commit (atomic)
// =============================================================================

export async function commitIntake(params: {
  athlete_id: bigint | number;
  coach_id: bigint | number;
  coach_user_id: bigint | number;
  payload: unknown;
  now?: Date;
  client?: Sql;
}): Promise<CommitResult> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();

  const parsed = intakeCommitSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new IntakeError('invalid_payload', parsed.error.message, 400);
  }
  const commit: IntakeCommit = parsed.data;

  // Verify ownership and that intake hasn't already been committed.
  const checkRows = await client<
    Array<{ coach_id: string | null; intake_completed_at: Date | null }>
  >`
    select a.coach_id::text as coach_id, a.intake_completed_at
    from athletes a
    where a.id = ${params.athlete_id as number}
    limit 1
  `;
  const check = checkRows[0];
  if (!check) {
    throw new IntakeError('not_found', `athlete ${params.athlete_id} not found`, 404);
  }
  if (check.coach_id !== String(params.coach_id)) {
    throw new IntakeError('forbidden', 'athlete is not assigned to this coach', 403);
  }
  if (check.intake_completed_at) {
    throw new IntakeError('already_committed', 'intake already completed', 409);
  }

  // AGNOSTIC: intake no longer auto-plans an ATR macrocycle. The coach's intended
  // periodization shape (block_specs) is recorded as snapshot DATA only; the actual
  // training weeks are materialized as microciclos (athlete_month_assignments) either
  // from an explicitly-chosen month template (below) or as a first-microciclo draft
  // from the coach's first month template — the ORDER of microciclos IS the plan.
  const snapshot: IntakeNotesSnapshot = {
    level: commit.level,
    block_specs: commit.block_specs,
    baseline_tests: commit.baseline_tests,
    acknowledged_warnings: commit.acknowledged_warnings,
    welcome_sent: commit.welcome.send && Boolean(commit.welcome.body && commit.welcome.body.trim()),
    notes: commit.notes,
    committed_at: now.toISOString(),
  };

  // Mark intake completed + persist snapshot.
  await client`
    update athletes
    set intake_completed_at = ${now.toISOString()}::timestamptz,
        intake_by_coach_id = ${params.coach_id as number},
        intake_notes_json = ${JSON.stringify(snapshot)}::jsonb,
        updated_at = now()
    where id = ${params.athlete_id as number}
  `;

  // Schedule programmed baseline tests. We don't have a dedicated tests table —
  // baseline tests are recorded in intake_notes_json (and surfaced from there
  // by the cohort UI). Auto tests need no scheduling.
  // Note: when actual workout templates exist for these tests (HYROX sim, 1RM
  // battery, 5K) we'll insert into workout_assignments; for now the intake
  // notes are the source of truth. Count what we *would* schedule.
  const programmedCount = commit.baseline_tests.filter(
    (t: IntakeBaselineTest) => t.kind === 'programmed' && t.scheduled_for !== null,
  ).length;

  // Welcome message — open or reuse a chat thread, append message.
  let welcome_sent = false;
  if (commit.welcome.send && commit.welcome.body && commit.welcome.body.trim().length > 0) {
    welcome_sent = await sendWelcomeMessage({
      client,
      coach_id: params.coach_id,
      coach_user_id: params.coach_user_id,
      athlete_id: params.athlete_id,
      body: commit.welcome.body.trim(),
      now,
    });
  }

  // Optional: assign first month from template when Pablo confirms in intake.
  let month_assignment_count = 0;
  let first_block_draft: FirstBlockDraftResult | null = null;
  let first_assignment_id: string | null = null;
  if (commit.month_template_id && commit.month_start_date) {
    // Use the SHARED materializer (lib/dashboard/coach/instantiate-program). It
    // materializes a session's inline `blocks[]` into a real template + segments
    // (carrying prescription_json), not just `template_id` references — so an
    // intake-committed month whose sessions are inline-block-authored creates the
    // workout_assignments instead of silently dropping them. Single source of
    // truth: every assign path (assign-month, assign-sequence, /hoy approve) uses
    // this same materializer.
    const { instantiateMonthFromTemplate } = await import(
      '@/lib/dashboard/coach/instantiate-program'
    );
    const assignResult = await instantiateMonthFromTemplate({
      coach_id: params.coach_id,
      athlete_id: params.athlete_id,
      month_template_id: commit.month_template_id,
      start_date: commit.month_start_date,
      client,
    });
    month_assignment_count = assignResult.assignment_count;
    first_assignment_id = assignResult.month_assignment_id;
  } else {
    // Default path (the form never sends month_template_id): materialize the
    // coach's FIRST month template as a first microciclo IN DRAFT, so Pablo lands
    // on a reviewable draft, NOT an empty calendar. AGNOSTIC — reuses the shared
    // materializer; no ATR fabrication. Soft-fails: if the coach has no month
    // templates yet, no draft is created and Pablo programs the first microciclo
    // manually — intake must not 500 over a template gap.
    first_block_draft = await materializeFirstMicrocicloDraft({
      coach_id: params.coach_id,
      athlete_id: params.athlete_id,
      client,
    });
    first_assignment_id = first_block_draft?.assignment_id ?? null;
  }

  return {
    athlete_id: String(params.athlete_id),
    macrocycle_id: first_assignment_id,
    scheduled_assignments:
      month_assignment_count || first_block_draft?.assignment_count || programmedCount,
    month_assignment_count,
    welcome_sent,
    first_block_draft: first_block_draft
      ? {
          block_type: first_block_draft.block_type,
          start_date: first_block_draft.start_date,
          week_count: first_block_draft.week_count,
          week_starts: first_block_draft.week_starts,
          assignment_count: first_block_draft.assignment_count,
        }
      : null,
  };
}

// =============================================================================
// First-microciclo draft (default intake path) — AGNOSTIC: materializes the
// coach's FIRST month template (a microciclo) via the shared materializer, then
// marks each week as a PRIVATE manual draft via markWeekDraft (same gate as the
// /assign-draft route: delivery_mode='manual', so the publish cron NEVER
// auto-releases it) so Pablo lands on a reviewable draft, not an empty calendar.
// =============================================================================

type FirstBlockDraftResult = {
  /** Microciclo NAME (coach data). */
  block_type: string;
  /** athlete_month_assignments.id of the materialized first microciclo. */
  assignment_id: string;
  start_date: string;
  week_count: number;
  week_starts: string[];
  assignment_count: number;
};

async function materializeFirstMicrocicloDraft(params: {
  coach_id: bigint | number;
  athlete_id: bigint | number;
  client: Sql;
}): Promise<FirstBlockDraftResult | null> {
  const { instantiateMonthFromTemplate, InstantiateProgramError } = await import(
    '@/lib/dashboard/coach/instantiate-program'
  );
  const { markWeekDraft, DELIVERY_MODE } = await import('./publish-week');
  const { addDays, isoDateString, mondayOfWeek } = await import(
    '@fahybrid/shared/domain/dates'
  );

  // The coach's first month template (a microciclo). No month templates yet →
  // no draft (degrade gracefully; Pablo programs the first microciclo manually).
  const tplRows = await params.client<Array<{ id: string; name: string }>>`
    select id::text, name
    from program_month_templates
    where coach_id = ${Number(params.coach_id)}
    order by id asc
    limit 1
  `;
  const tpl = tplRows[0];
  if (!tpl) return null;

  // Anchor to this week's Monday so the materializer's Monday-aligned microcycles
  // line up with the draft week_start dates we mark below.
  const startMonday = mondayOfWeek(new Date());
  const startIso = isoDateString(startMonday);

  let assign: Awaited<ReturnType<typeof instantiateMonthFromTemplate>>;
  try {
    assign = await instantiateMonthFromTemplate({
      coach_id: params.coach_id,
      athlete_id: params.athlete_id,
      month_template_id: Number(tpl.id),
      start_date: startIso,
      client: params.client,
    });
  } catch (err) {
    // Empty / unusable month template → degrade gracefully, no draft.
    if (err instanceof InstantiateProgramError) {
      return null;
    }
    throw err;
  }

  const weekCount = assign.microcycle_ids.length;
  const weekStarts: string[] = [];
  for (let i = 0; i < weekCount; i += 1) {
    const weekStart = isoDateString(addDays(startMonday, i * DAYS_PER_WEEK));
    await markWeekDraft({
      coach_id: params.coach_id,
      athlete_id: params.athlete_id,
      week_start: weekStart,
      delivery_mode: DELIVERY_MODE.manual,
      client: params.client,
    });
    weekStarts.push(weekStart);
  }

  return {
    block_type: tpl.name,
    assignment_id: assign.month_assignment_id,
    start_date: assign.start_date,
    week_count: weekCount,
    week_starts: weekStarts,
    assignment_count: assign.assignment_count,
  };
}

async function sendWelcomeMessage(params: {
  client: Sql;
  coach_id: bigint | number;
  coach_user_id: bigint | number;
  athlete_id: bigint | number;
  body: string;
  now: Date;
}): Promise<boolean> {
  // Find or create the 1:1 thread.
  const threadRows = await params.client<Array<{ id: string }>>`
    insert into chat_threads (coach_id, athlete_id, last_message_at, unread_for_athlete)
    values (
      ${params.coach_id as number},
      ${params.athlete_id as number},
      ${params.now.toISOString()}::timestamptz,
      1
    )
    on conflict (coach_id, athlete_id) do update
      set last_message_at = excluded.last_message_at,
          unread_for_athlete = chat_threads.unread_for_athlete + 1,
          updated_at = now()
    returning id::text as id
  `;
  const threadId = threadRows[0]?.id;
  if (!threadId) return false;

  await params.client`
    insert into chat_messages (thread_id, sender_user_id, sender_role, body)
    values (
      ${Number(threadId)},
      ${params.coach_user_id as number},
      'coach',
      ${params.body}
    )
  `;

  // Notify the athlete.
  await params.client`
    insert into notifications (user_id, type, payload_json)
    select a.user_id, 'chat_message', ${JSON.stringify({
      kind: 'welcome',
      thread_id: threadId,
      coach_id: String(params.coach_id),
    })}::jsonb
    from athletes a
    where a.id = ${params.athlete_id as number}
  `;

  return true;
}

// =============================================================================
// Helpers
// =============================================================================

function classifyBenchmark(slug: string): BenchmarkGroup {
  // Canonical benchmark slugs (the ones the onboarding route actually writes)
  // single-sourced in @fahybrid/shared/domain/coach/benchmark-slugs.
  const oneRmSlugs = new Set<string>([
    BENCH_BACK_SQUAT_1RM,
    BENCH_DEADLIFT_1RM,
    BENCH_BENCH_PRESS_1RM,
    BENCH_OHP_1RM,
    BENCH_CLEAN_1RM,
    BENCH_SNATCH_1RM,
    BENCH_STRICT_PULL_UP_MAX,
    BENCH_PUSH_UPS_PER_MIN,
  ]);
  const enduranceSlugs = new Set<string>([
    BENCH_RUN_5K,
    BENCH_RUN_10K,
    BENCH_RUN_HALF,
    BENCH_RUN_MARATHON,
  ]);
  const stationSlugs = new Set<string>([
    'wall_balls',
    'sled_push',
    'sled_pull',
    'burpee_broad_jump',
    'farmer_carry',
    'sandbag_lunges',
    'rowing_erg',
    'ski_erg',
  ]);
  const anaerobicSlugs = new Set<string>([BENCH_ROW_2K, BENCH_SKI_1K, '3min_row_max', 'lt_threshold']);
  if (oneRmSlugs.has(slug)) return 'one_rm';
  if (enduranceSlugs.has(slug)) return 'endurance';
  if (stationSlugs.has(slug)) return 'hyrox_station';
  if (anaerobicSlugs.has(slug)) return 'anaerobic_threshold';
  return 'other';
}

function humanize(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

interface ParsedInjury {
  area: string;
  type?: string;
  severity?: 'mild' | 'moderate' | 'severe';
  notes?: string;
  active?: boolean;
}

function parseInjuries(raw: unknown): ParsedInjury[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedInjury[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.area !== 'string' || r.area.length === 0) continue;
    out.push({
      area: r.area,
      type: typeof r.type === 'string' ? r.type : undefined,
      severity:
        r.severity === 'mild' || r.severity === 'moderate' || r.severity === 'severe'
          ? r.severity
          : undefined,
      notes: typeof r.notes === 'string' ? r.notes : undefined,
      active: typeof r.active === 'boolean' ? r.active : true,
    });
  }
  return out;
}

/** Seconds → H:MM:SS (or M:SS when under an hour) for race times. */
function formatHms(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetween(a: Date, b: Date): number {
  const aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bDay = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bDay - aDay) / 86_400_000);
}

function computeAge(dobIso: string, now: Date): number {
  const dob = parseIsoDate(dobIso);
  const years = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    return years - 1;
  }
  return years;
}
