import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { suggestAthleteTrainingLevel } from '@/lib/coach/athlete-training-level';
import { getBestRealHyroxResult, hyroxExperienceFromCount } from '@/lib/races/athlete-races';
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
  BENCHMARK_UNIT_KG,
  BENCHMARK_UNIT_REPS,
  BENCHMARK_UNIT_SECONDS,
  hyroxBenchmarkSlug,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { STRENGTH_LIFT_SLUGS } from '@fahybrid/shared/schema/strength';
import { seedOnboardingStrengthMaxes } from '@/lib/strength/strength-max';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// M10: the iOS onboarding sends a rich, ~60-field snapshot (PRs, station
// benchmarks, devices, goals…) that we persist verbatim into
// `intake_notes_json` for the coach/IA to read. The previous `.passthrough()`
// accepted ANY shape, so an athlete could inflate the row with MBs of junk.
//
// Instead of duplicating the entire iOS DTO here (drift-prone), we model the
// fields we read in code explicitly and apply a BOUNDED catchall to everything
// else: unknown keys are allowed but only as small primitives / short strings /
// small arrays of short strings. Anything bigger (the DoS vector) is rejected.
const MAX_FREE_TEXT_CHARS = 4_000; // generous bound for any single text field
const MAX_PASSTHROUGH_ARRAY_ITEMS = 64; // e.g. devices_owned, divisions
const MAX_PASSTHROUGH_KEYS = 128; // far above the legit ~60-field snapshot

// A single extra (unmodeled) snapshot value: a short string, a finite number,
// a boolean, null, or a small array of short strings. Caps the byte footprint
// of anything an athlete can smuggle through.
const boundedScalar = z.union([
  z.string().max(MAX_FREE_TEXT_CHARS),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const passthroughValue = z.union([
  boundedScalar,
  z.array(z.string().max(MAX_FREE_TEXT_CHARS)).max(MAX_PASSTHROUGH_ARRAY_ITEMS),
]);

// ── CANONICAL CONTRACT — expanded 13-step intake (migration 0047) ───────────
// Single source of truth for the structured payload iOS + web build against.
// Every field below maps 1:1 to a normalized destination (athletes column,
// athlete_benchmarks row, races row, or athletes.injuries_json). The bounded
// .catchall is RETAINED for backward-compat with the legacy flat iOS draft
// (subjective_stress, sleep_hours_avg, station_* …) so the current onboarding
// keeps working while implementers migrate the UI to this shape.
//
// WRITE NOTE: this route currently persists the whole snapshot into
// intake_notes_json + a handful of athletes columns. The NORMALIZED writes for
// the new fields (athletes.* columns, athlete_benchmarks rows, races rows,
// structured injuries_json) are intentionally left as TODO for the web
// implementer — see the TODO block in POST(). This file's job is the CONTRACT.

// Shared scalar shapes (reused across steps).
const intRange = (min: number, max: number) => z.number().int().min(min).max(max);
const scale1to10 = intRange(1, 10); // subjective 1-10 scales
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
const timeOfDay = z.string().regex(/^\d{2}:\d{2}$/); // HH:MM (24h, local)
const shortText = z.string().max(500);
const longText = z.string().max(MAX_FREE_TEXT_CHARS);

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// Step 4 — structured injuries -> athletes.injuries_json
const injurySchema = z.object({
  area: z.string().max(80), // e.g. "left_knee", "lower_back"
  type: z.string().max(80), // e.g. "tendinitis", "sprain"
  active: z.boolean(),
  note: z.string().max(500).optional(),
});

// Step 5 — per-day availability status -> athletes.availability_json
const dayAvailabilitySchema = z.enum(['program', 'other_activity', 'rest']);
const availabilitySchema = z.record(z.enum(WEEKDAYS), dayAvailabilitySchema);

// Step 6 — per-day preferred training types -> athletes.preferred_week_json
const preferredTypeSchema = z.enum([
  'isolated_run',
  'strength_gym',
  'hyrox_transitions',
  'ergo_conditioning',
  'specific_material',
]);
const preferredWeekSchema = z.record(z.enum(WEEKDAYS), z.array(preferredTypeSchema).max(5));

// Step 7 — reconciled equipment list -> athletes.equipment_json
const equipmentSchema = z.enum([
  'barbells_plates',
  'dumbbells',
  'sleds',
  'bags_kb',
  'open_space',
  'pulleys',
  'treadmill',
  'stationary_bike',
  'rower',
  'skierg',
  'other',
]);

// Step 8 — watch brand (reuses the DB device_type enum surface)
const watchBrandSchema = z.enum([
  'apple_watch',
  'garmin',
  'polar',
  'coros',
  'suunto',
  'whoop',
  'oura',
  'other',
]);

// Step 12 — A-event + intermediate races -> races rows (0046)
const raceSchema = z.object({
  name: z.string().max(200),
  event_type: z.enum(['hyrox', 'deka', 'other']),
  format: z.enum(['singles', 'doubles', 'relay']),
  division: z.enum(['open', 'pro']),
  gender_category: z.enum(['men', 'women', 'mixed']),
  priority: z.enum(['target', 'secondary', 'tune_up']),
  race_date: isoDate,
  location: z.string().max(200).optional(),
  goal_time_seconds: intRange(0, 86_400).optional(),
});

// The 13-step canonical intake. All fields optional (per-step skippable —
// Pablo programs tests for what's left empty).
const onboardingSnapshotSchema = z
  .object({
    // ── Step 1 — datos personales (EXISTS) ──────────────────────────────────
    full_name: z.string().max(200).optional(),
    date_of_birth: isoDate.optional(),
    sex: z.enum(['male', 'female', 'other']).optional(),
    height_cm: z.number().min(80).max(260).optional(),
    weight_kg: z.number().min(25).max(250).optional(),

    // ── Step 2 — relación con el deporte (NEW; feeds plan) ───────────────────
    goal_type: z
      .enum(['first_hyrox', 'improve_hyrox_mark', 'improve_running', 'complete_fun', 'other'])
      .optional(),
    goal_other_text: shortText.optional(),
    run_experience: z.enum(['enthusiast', 'comfortable', 'reluctant', 'none']).optional(),
    strength_experience: z.enum(['loves_lifting', 'weekly_ish', 'with_guidance', 'none']).optional(),

    // ── Step 3 — hábitos & estado (NEW; subjective 1-10; feeds readiness) ─────
    sleep_quality: scale1to10.optional(),
    stress_level: scale1to10.optional(),
    commitment_level: scale1to10.optional(),

    // ── Step 4 — lesiones & limitaciones -> injuries_json + text ─────────────
    injuries: z.array(injurySchema).max(32).optional(),
    movement_limitations: longText.optional(),

    // ── Step 5 — disponibilidad (feeds planner day-assignment) ───────────────
    availability: availabilitySchema.optional(),
    available_from: timeOfDay.optional(),
    available_to: timeOfDay.optional(),
    session_minutes: intRange(10, 360).optional(),
    schedule_flexible: z.boolean().optional(),

    // ── Step 6 — semana típica preferida (feeds planner day-type) ────────────
    preferred_week: preferredWeekSchema.optional(),

    // ── Step 7 — instalación & material (feeds template/exercise filtering) ───
    facility_type: z.enum(['commercial_gym', 'crossfit_box', 'multiple', 'other']).optional(),
    facility_other_text: shortText.optional(),
    equipment: z.array(equipmentSchema).max(16).optional(),
    has_track: z.boolean().optional(),
    has_flat_run: z.boolean().optional(),

    // ── Step 8 — dispositivos -> athletes quick-read + devices rows ──────────
    watch_brand: watchBrandSchema.optional(),
    watch_model: shortText.optional(),
    has_hr_belt: z.boolean().optional(),

    // ── Step 9 — metas (coach/IA narrative; anchors macro) ───────────────────
    goal_short: longText.optional(),
    goal_mid: longText.optional(),
    goal_long: longText.optional(),
    achievable_2_4_months: z.enum(['yes', 'no', 'unknown']).optional(),
    biggest_obstacle: longText.optional(),
    pct_depends_on_me: scale1to10.optional(),
    coach_role: longText.optional(),

    // ── Step 10 — métricas fuerza -> athlete_benchmarks rows (kg, except reps) ─
    one_rm_back_squat_kg: z.number().min(0).max(500).optional(),
    one_rm_deadlift_kg: z.number().min(0).max(500).optional(),
    one_rm_bench_press_kg: z.number().min(0).max(400).optional(),
    one_rm_ohp_kg: z.number().min(0).max(300).optional(), // strict press == OHP (deduped)
    one_rm_clean_kg: z.number().min(0).max(300).optional(),
    one_rm_snatch_kg: z.number().min(0).max(250).optional(),
    strict_pull_ups_max: intRange(0, 100).optional(),
    push_ups_per_minute: intRange(0, 200).optional(),

    // ── Step 11 — resistencia & híbrido -> athlete_benchmarks rows (seconds) ──
    time_5k_seconds: intRange(0, 14_400).optional(),
    time_10k_seconds: intRange(0, 28_800).optional(),
    time_half_seconds: intRange(0, 43_200).optional(),
    time_marathon_seconds: intRange(0, 86_400).optional(),
    // Ergo time trials — captured by iOS onboarding, previously dropped into the
    // catchall blob; now modeled + persisted as benchmark rows (the level
    // algorithm + intake suggestions read row_2k / ski_1k).
    time_2k_row_seconds: intRange(0, 3_600).optional(),
    time_1k_ski_seconds: intRange(0, 1_800).optional(),
    hybrid_tests_notes: longText.optional(),

    // ── HYROX history (carried from the legacy flat snapshot) ─────────────────
    // hyrox_best_time_seconds + the declared division feed the level algorithm's
    // hyrox_open / hyrox_pro benchmark. Previously only reached intake_notes_json.
    hyrox_best_time_seconds: intRange(0, 14_400).optional(),
    hyrox_divisions: z.array(z.string().max(40)).max(8).optional(),

    // ── Step 12 — A-event + carreras -> races rows ───────────────────────────
    races: z.array(raceSchema).max(12).optional(),

    // ── Step 13 — conexiones (client truth) ──────────────────────────────────
    healthkit_granted: z.boolean().optional(),
    garmin_connected: z.boolean().optional(),

    // ── Carried over from the legacy flat snapshot (still written today) ──────
    training_years: z.number().int().min(0).max(80).optional(),
    training_level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    hours_per_week: z.number().int().min(0).max(40).optional(),
    primary_discipline: z.string().max(40).optional(),
    days_per_week: z.number().int().min(1).max(14).optional(),
  })
  // Bounded catchall keeps the legacy flat iOS draft fields (station_*,
  // sleep_hours_avg, subjective_stress, hyrox_*, a_event_*, …) accepted until
  // the iOS UI is migrated to the structured shape above.
  .catchall(passthroughValue)
  .refine((obj) => Object.keys(obj).length <= MAX_PASSTHROUGH_KEYS, {
    message: `snapshot has too many fields (max ${MAX_PASSTHROUGH_KEYS})`,
  });

const submitSchema = z.object({
  snapshot: onboardingSnapshotSchema,
});

// ── NORMALIZED-WRITE HELPERS (migration 0047) ───────────────────────────────

type Snapshot = z.infer<typeof onboardingSnapshotSchema>;

// Tags onboarding-sourced benchmark rows so re-submits replace ONLY them
// (coach-entered / later PRs are never touched).
const BENCHMARK_SOURCE = 'onboarding';

// Step 8: watch_brand is stored in the existing `device_type` enum
// (apple_watch|iphone|garmin|concept2|whoop|oura|other). The intake offers a
// wider brand list (polar|coros|suunto) than that enum carries, so brands the
// enum can't represent collapse to 'other' (the free-text watch_model keeps the
// real brand). This mapping is applied to BOTH athletes.watch_brand and the
// `devices` row so they never disagree.
const DEVICE_TYPE_VALUES = new Set([
  'apple_watch',
  'iphone',
  'garmin',
  'concept2',
  'whoop',
  'oura',
  'other',
]);
function toDeviceType(brand: string | undefined): string | null {
  if (!brand) return null;
  return DEVICE_TYPE_VALUES.has(brand) ? brand : 'other';
}

// Steps 10/11: each provided benchmark -> one athlete_benchmarks row.
// Canonical (exercise_slug, unit) per the contract. Only present/non-null
// values produce a row.
function benchmarksFromSnapshot(
  snap: Snapshot,
): Array<{ exercise_slug: string; value: number; unit: string }> {
  // Division for the HYROX best-time benchmark: 'pro' if any declared division
  // is pro, else open. Open is the algorithm's default.
  const hyroxDivision = (snap.hyrox_divisions ?? []).some(
    (d) => d.toLowerCase().includes('pro'),
  )
    ? 'pro'
    : 'open';

  const defs: Array<[number | undefined, string, string]> = [
    // Step 10 — strength (kg, except rep-count tests)
    [snap.one_rm_back_squat_kg, BENCH_BACK_SQUAT_1RM, BENCHMARK_UNIT_KG],
    [snap.one_rm_deadlift_kg, BENCH_DEADLIFT_1RM, BENCHMARK_UNIT_KG],
    [snap.one_rm_bench_press_kg, BENCH_BENCH_PRESS_1RM, BENCHMARK_UNIT_KG],
    [snap.one_rm_ohp_kg, BENCH_OHP_1RM, BENCHMARK_UNIT_KG],
    [snap.one_rm_clean_kg, BENCH_CLEAN_1RM, BENCHMARK_UNIT_KG],
    [snap.one_rm_snatch_kg, BENCH_SNATCH_1RM, BENCHMARK_UNIT_KG],
    [snap.strict_pull_ups_max, BENCH_STRICT_PULL_UP_MAX, BENCHMARK_UNIT_REPS],
    [snap.push_ups_per_minute, BENCH_PUSH_UPS_PER_MIN, BENCHMARK_UNIT_REPS],
    // Step 11 — endurance / hybrid (seconds)
    [snap.time_5k_seconds, BENCH_RUN_5K, BENCHMARK_UNIT_SECONDS],
    [snap.time_10k_seconds, BENCH_RUN_10K, BENCHMARK_UNIT_SECONDS],
    [snap.time_half_seconds, BENCH_RUN_HALF, BENCHMARK_UNIT_SECONDS],
    [snap.time_marathon_seconds, BENCH_RUN_MARATHON, BENCHMARK_UNIT_SECONDS],
    // Ergo time trials (seconds) — previously captured but dropped.
    [snap.time_2k_row_seconds, BENCH_ROW_2K, BENCHMARK_UNIT_SECONDS],
    [snap.time_1k_ski_seconds, BENCH_SKI_1K, BENCHMARK_UNIT_SECONDS],
    // HYROX best time (seconds) — previously only in the notes blob.
    [snap.hyrox_best_time_seconds, hyroxBenchmarkSlug(hyroxDivision), BENCHMARK_UNIT_SECONDS],
  ];
  const rows: Array<{ exercise_slug: string; value: number; unit: string }> = [];
  for (const [value, exercise_slug, unit] of defs) {
    if (value == null) continue;
    rows.push({ exercise_slug, value, unit });
  }
  return rows;
}

// training_days_per_week is DERIVED — count of availability days == 'program'.
function programDayCount(availability: Snapshot['availability']): number | null {
  if (!availability) return null;
  return Object.values(availability).filter((v) => v === 'program').length;
}

export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const snap = parsed.data.snapshot;
  const level = snap.training_level ?? null;

  const { sql } = await import('@/lib/db');

  const athleteId = Number(auth.athlete_id);

  // Real race history (HYROX singles results imported BEFORE this submit) is the
  // gold-standard signal — it drives both the experience tier (count → real
  // hyrox_experience, no longer hardcoded null) and the N1–N5 level suggestion
  // computed after the commit. No real history → graceful self-declared fallback.
  const realHyrox = await getBestRealHyroxResult(athleteId, sql);
  const suggestion = suggestAthleteTrainingLevel({
    athlete_level: level,
    weekly_hours: snap.hours_per_week ?? null,
    hyrox_experience: hyroxExperienceFromCount(realHyrox.race_count),
    hyrox_best_time_seconds: realHyrox.best_time_seconds,
    self_declared_elite_signals: level === 4,
  });
  // training_days_per_week: prefer the DERIVED count of 'program' availability
  // days (the structured truth); fall back to the legacy flat days_per_week.
  const derivedTrainingDays = programDayCount(snap.availability) ?? snap.days_per_week ?? null;
  const watchDeviceType = toDeviceType(snap.watch_brand);
  const benchmarks = benchmarksFromSnapshot(snap);
  // Dedupe races by (name, race_date) within this submit before persisting.
  const races = (snap.races ?? []).filter(
    (r, i, arr) => arr.findIndex((o) => o.name === r.name && o.race_date === r.race_date) === i,
  );

  // All writes for one intake are atomic: the athletes row, its structured JSON,
  // benchmark rows, race rows, and the device row commit together or not at all.
  const updated = await sql.begin(async (tx) => {
    const rows = await tx<Array<{ onboarded_first_time: boolean; full_name: string | null }>>`
      update athletes
      set
        full_name = coalesce(${snap.full_name ?? null}, full_name),
        dob = coalesce(${snap.date_of_birth ?? null}::date, dob),
        sex = coalesce(${snap.sex ?? null}::athlete_sex, sex),
        height_cm = coalesce(${snap.height_cm ?? null}, height_cm),
        weight_kg = coalesce(${snap.weight_kg ?? null}, weight_kg),
        training_experience_years = coalesce(${snap.training_years ?? null}, training_experience_years),
        primary_discipline = coalesce(${snap.primary_discipline ?? null}::discipline, primary_discipline),
        training_days_per_week = coalesce(${derivedTrainingDays}, training_days_per_week),

        -- Step 2 — relación con el deporte
        goal_type = coalesce(${snap.goal_type ?? null}::onboarding_goal_type, goal_type),
        goal_other_text = coalesce(${snap.goal_other_text ?? null}, goal_other_text),
        run_experience = coalesce(${snap.run_experience ?? null}::run_experience, run_experience),
        strength_experience = coalesce(${snap.strength_experience ?? null}::strength_experience, strength_experience),

        -- Step 3 — hábitos & estado (1-10)
        sleep_quality = coalesce(${snap.sleep_quality ?? null}, sleep_quality),
        stress_level = coalesce(${snap.stress_level ?? null}, stress_level),
        commitment_level = coalesce(${snap.commitment_level ?? null}, commitment_level),

        -- Step 4 — lesiones & limitaciones (structured + free text)
        injuries_json = coalesce(${snap.injuries ? tx.json(snap.injuries) : null}::jsonb, injuries_json),
        movement_limitations = coalesce(${snap.movement_limitations ?? null}, movement_limitations),

        -- Step 5 — disponibilidad
        availability_json = coalesce(${snap.availability ? tx.json(snap.availability) : null}::jsonb, availability_json),
        available_from = coalesce(${snap.available_from ?? null}::time, available_from),
        available_to = coalesce(${snap.available_to ?? null}::time, available_to),
        session_minutes = coalesce(${snap.session_minutes ?? null}, session_minutes),
        schedule_flexible = coalesce(${snap.schedule_flexible ?? null}, schedule_flexible),

        -- Step 6 — semana típica preferida
        preferred_week_json = coalesce(${snap.preferred_week ? tx.json(snap.preferred_week) : null}::jsonb, preferred_week_json),

        -- Step 7 — instalación & material
        facility_type = coalesce(${snap.facility_type ?? null}::facility_type, facility_type),
        facility_other_text = coalesce(${snap.facility_other_text ?? null}, facility_other_text),
        equipment_json = coalesce(${snap.equipment ? tx.json(snap.equipment) : null}::jsonb, equipment_json),
        has_track = coalesce(${snap.has_track ?? null}, has_track),
        has_flat_run = coalesce(${snap.has_flat_run ?? null}, has_flat_run),

        -- Step 8 — dispositivos (quick-read flags; real device rows written below)
        watch_brand = coalesce(${watchDeviceType}::device_type, watch_brand),
        watch_model = coalesce(${snap.watch_model ?? null}, watch_model),
        has_hr_belt = coalesce(${snap.has_hr_belt ?? null}, has_hr_belt),

        -- Step 9 — metas (narrative)
        goal_short = coalesce(${snap.goal_short ?? null}, goal_short),
        goal_mid = coalesce(${snap.goal_mid ?? null}, goal_mid),
        goal_long = coalesce(${snap.goal_long ?? null}, goal_long),
        achievable_2_4_months = coalesce(${snap.achievable_2_4_months ?? null}::goal_achievable, achievable_2_4_months),
        biggest_obstacle = coalesce(${snap.biggest_obstacle ?? null}, biggest_obstacle),
        pct_depends_on_me = coalesce(${snap.pct_depends_on_me ?? null}, pct_depends_on_me),
        coach_role = coalesce(${snap.coach_role ?? null}, coach_role),

        -- Step 13 — connections (client truth)
        healthkit_granted = coalesce(${snap.healthkit_granted ?? null}, healthkit_granted),

        onboarded_at = coalesce(onboarded_at, now()),
        intake_notes_json = intake_notes_json || ${JSON.stringify({
          onboarding: snap,
          suggested_training_level: level,
          training_level_suggestion: suggestion,
        })}::jsonb,
        updated_at = now()
      where id = ${athleteId}
      returning (xmax = 0 or onboarded_at = updated_at) as onboarded_first_time, full_name
    `;

    // Steps 10/11 — benchmarks. IDEMPOTENT: drop this athlete's prior
    // onboarding-sourced rows (tagged via notes), then re-insert the current
    // set. Coach-entered / later benchmarks (untagged) are never deleted.
    await tx`
      delete from athlete_benchmarks
      where athlete_id = ${athleteId} and notes = ${BENCHMARK_SOURCE}
    `;
    if (benchmarks.length > 0) {
      await tx`
        insert into athlete_benchmarks ${tx(
          benchmarks.map((b) => ({
            athlete_id: athleteId,
            exercise_slug: b.exercise_slug,
            value: b.value,
            unit: b.unit,
            notes: BENCHMARK_SOURCE,
          })),
          'athlete_id',
          'exercise_slug',
          'value',
          'unit',
          'notes',
        )}
      `;
    }

    // Seed the kg 1RMs into the versioned strength system (athlete_strength_maxes)
    // as version-1 'onboarding' rows, so onboarding maxes flow into %RM→kg plan
    // resolution + the Perfil 1RM panel. Idempotent (seeds only absent lifts) — a
    // re-submit never creates a new version or clobbers a later test.
    const strengthSeed = benchmarks
      .filter(
        (b) =>
          b.unit === BENCHMARK_UNIT_KG &&
          (STRENGTH_LIFT_SLUGS as readonly string[]).includes(b.exercise_slug),
      )
      .map((b) => ({ exercise_slug: b.exercise_slug, one_rm_kg: b.value }));
    await seedOnboardingStrengthMaxes(tx, athleteId, strengthSeed);

    // Step 12 — races. IDEMPOTENT: insert each race only if no race with the
    // same (athlete_id, name, race_date) already exists (re-submit-safe without
    // clobbering coach edits to an existing race).
    for (const r of races) {
      await tx`
        insert into races (
          athlete_id, created_by_coach_id, name, event_type, format, division,
          gender_category, priority, race_date, location, goal_time_seconds, status
        )
        select
          ${athleteId}, null, ${r.name}, ${r.event_type}::race_event_type,
          ${r.format}::race_format, ${r.division}::race_division,
          ${r.gender_category}::race_gender, ${r.priority}::race_priority,
          ${r.race_date}::date, ${r.location ?? null}, ${r.goal_time_seconds ?? null},
          'planned'::race_status
        where not exists (
          select 1 from races
          where athlete_id = ${athleteId}
            and name = ${r.name}
            and race_date = ${r.race_date}::date
        )
      `;
    }

    // Step 8 — device row for the watch. IDEMPOTENT via the existing
    // (athlete_id, type, identifier) unique constraint. identifier is a stable
    // synthetic key per athlete+brand so re-submits update display_name rather
    // than duplicate.
    if (watchDeviceType) {
      const identifier = `onboarding:${snap.watch_brand}`;
      const displayName = [snap.watch_brand, snap.watch_model].filter(Boolean).join(' ') || null;
      await tx`
        insert into devices (athlete_id, type, identifier, display_name)
        values (${athleteId}, ${watchDeviceType}::device_type, ${identifier}, ${displayName})
        on conflict (athlete_id, type, identifier)
        do update set display_name = excluded.display_name, updated_at = now()
      `;
    }

    return rows;
  });

  // The athlete's target lives here, on `races` (priority='target') — the unified
  // spine. An onboarding race is a free-text entry with no curated `events`
  // catalog match yet, so its optional `event_id` catalog link stays null; the
  // race is self-owning and the "días a carrera objetivo" metric derives from it.

  // Auto-derive the athlete's zone profiles from the benchmarks just stored, so
  // the coach doesn't have to re-register a test by hand for ritmos to resolve.
  // Fire-and-forget (best-effort, same posture as the level suggestion): a
  // failure here never fails the onboarding submit. The service is idempotent and
  // never clobbers a coach test, so a later re-submit is safe.
  try {
    const { deriveAndStoreOnboardingZones } = await import('@/lib/dashboard/v2/onboarding-zones');
    await deriveAndStoreOnboardingZones({ athlete_id: athleteId, client: sql });
  } catch {
    // auto-zones best-effort — the coach can still register a test manually.
  }

  // Compute + persist the N1–N5 level suggestion now, so the coach's intake
  // review (and roster / Hoy's "nivel sugerido") sees a real-data-driven
  // suggestion immediately — not only after the intake commit. Real HYROX
  // results drive it; idempotent + guarded by level_id IS NULL, so it's safe to
  // re-run when more races are imported later (intake-review load re-runs it).
  // Best-effort like the zones: a failure never fails the onboarding submit.
  try {
    const coachRows = await sql<Array<{ coach_id: number }>>`
      select coach_id from athletes where id = ${athleteId} limit 1
    `;
    const coachId = coachRows[0]?.coach_id;
    if (coachId != null) {
      const { computeAndStoreLevelSuggestion } = await import('@/lib/coach/level-proposal');
      await computeAndStoreLevelSuggestion(athleteId, Number(coachId));
    }
  } catch {
    // level-suggestion best-effort — the coach can still set the level by hand.
  }

  // Notify Pablo so an intake-pending athlete doesn't sit invisible. Only fire
  // the first time the athlete onboards (intake_completed_at is still null).
  try {
    const { notifyCoach } = await import('@/lib/notifications/dispatch');
    const stateRows = await sql<Array<{ intake_completed_at: Date | null }>>`
      select intake_completed_at from athletes where id = ${Number(auth.athlete_id)} limit 1
    `;
    if (stateRows[0] && stateRows[0].intake_completed_at == null) {
      await notifyCoach({
        sql,
        athlete_id: BigInt(auth.athlete_id),
        type: 'intake_pending',
        payload: {
          athlete_id: String(auth.athlete_id),
          athlete_name: updated[0]?.full_name ?? 'Atleta',
          deep_link: `/es/atletas/${auth.athlete_id}/intake`,
        },
      });
    }
  } catch {
    // inbox-best-effort
  }

  return jsonOk({
    onboarded: true,
    suggested_training_level: level,
    training_level_suggestion: suggestion,
  });
}
