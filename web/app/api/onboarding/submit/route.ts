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
  BENCH_ROW_1K,
  BENCH_ROW_2K,
  BENCH_SKI_1K,
  BENCH_LTHR,
  BENCH_RUN_THRESHOLD,
  BENCH_RUN_1MILE,
  BENCH_FTP,
  BENCHMARK_UNIT_KG,
  BENCHMARK_UNIT_REPS,
  BENCHMARK_UNIT_SECONDS,
  BENCHMARK_UNIT_BPM,
  BENCHMARK_UNIT_WATTS,
  hyroxBenchmarkSlug,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { STRENGTH_LIFT_SLUGS } from '@fahybrid/shared/schema/strength';
import { seedOnboardingStrengthMaxes } from '@/lib/strength/strength-max';
import {
  readOnboardingSnapshot,
  type IntakeAnswerIssue,
  type OnboardingSnapshot,
} from '@/lib/athlete/onboarding-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The iOS onboarding sends a rich ~95-key snapshot (PRs, station benchmarks,
// devices, goals…). It is read ANSWER BY ANSWER (`lib/athlete/onboarding-
// snapshot.ts`): an answer that doesn't fit is clipped or dropped and listed for
// the coach («respuesta fuera de rango»), the rest is stored. Rejecting the whole
// intake for one field used to lose it silently (audit F-01). Every modeled field
// maps 1:1 to a normalized destination (athletes column, athlete_benchmarks row,
// races row, athletes.injuries_json); unmodeled keys (the legacy flat draft:
// station_*, a_event_*, …) are kept bounded in intake_notes_json.

type Snapshot = OnboardingSnapshot;

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
    [snap.time_1k_row_seconds, BENCH_ROW_1K, BENCHMARK_UNIT_SECONDS],
    // HYROX best time (seconds) — previously only in the notes blob.
    [snap.hyrox_best_time_seconds, hyroxBenchmarkSlug(hyroxDivision), BENCHMARK_UNIT_SECONDS],
    // Step 13 — the thresholds the athlete DECLARES. These are the top rung of
    // their ladders; `source: 'onboarding'` is what keeps them declared rather
    // than measured, so a guided test later supersedes them.
    [snap.lthr_bpm, BENCH_LTHR, BENCHMARK_UNIT_BPM],
    [snap.threshold_pace_seconds_per_km, BENCH_RUN_THRESHOLD, BENCHMARK_UNIT_SECONDS],
    [snap.time_1_mile_seconds, BENCH_RUN_1MILE, BENCHMARK_UNIT_SECONDS],
    [snap.ftp_watts, BENCH_FTP, BENCHMARK_UNIT_WATTS],
  ];
  const rows: Array<{ exercise_slug: string; value: number; unit: string }> = [];
  for (const [value, exercise_slug, unit] of defs) {
    if (value == null) continue;
    rows.push({ exercise_slug, value, unit });
  }
  return rows;
}

// training_days_per_week is DERIVED — count of availability days == 'program'.
// Zero is "no day marked" (the step skipped, every day left «Libre»), not an
// answer: the column only holds 1–14, and writing 0 used to fail the whole intake
// with a 500 the app retried until it expired.
function programDayCount(availability: Snapshot['availability']): number | null {
  if (!availability) return null;
  const n = Object.values(availability).filter((v) => v === 'program').length;
  return n > 0 ? n : null;
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

  // Only a body without a questionnaire is refused. Every answer is read on its
  // own: what doesn't fit is clipped or dropped and listed for the coach.
  const read =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? readOnboardingSnapshot((body as { snapshot?: unknown }).snapshot)
      : null;
  if (!read) return jsonError('bad_request', 'snapshot required', 400);

  const snap = read.snapshot;
  const outOfRange: IntakeAnswerIssue[] = read.issues;
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

        -- Step 13 — FC máxima declarada. Es la columna que resolveThresholdHr lee
        -- como tercer peldaño. coalesce, como el resto: si el atleta ya tiene una
        -- (del editor de Perfil o de un test), un re-submit NUNCA la pisa.
        -- UNA sola asignación: estaba escrita dos veces y Postgres rechaza el
        -- UPDATE entero («multiple assignments to same column»), así que TODO
        -- envío del cuestionario daba 500 desde el 5-sept (926a47b).
        max_hr_bpm = coalesce(${snap.max_hr_bpm ?? null}, max_hr_bpm),

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
        -- tx.json, NOT JSON.stringify(...)::jsonb: with the cast postgres.js types
        -- the parameter as jsonb and serializes the string AGAIN, so the column got
        -- a jsonb STRING and \`object || string\` turned the notes into an ARRAY
        -- ([{…}, "{…}"]) that no reader could open (0272 repairs those rows).
        intake_notes_json = intake_notes_json || ${tx.json(
          JSON.parse(
            JSON.stringify({
              onboarding: snap,
              // The answers that didn't fit (clipped or dropped), as they arrived —
              // the coach reads them in the alta as «respuestas fuera de rango».
              // Always written: a clean re-submit clears the previous list.
              onboarding_out_of_range: outOfRange,
              suggested_training_level: level,
              training_level_suggestion: suggestion,
            }),
          ) as Parameters<typeof tx.json>[0],
        )},
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
            // Typed provenance (0139): self-declared at onboarding — never counts
            // as a real test anywhere.
            source: BENCHMARK_SOURCE,
          })),
          'athlete_id',
          'exercise_slug',
          'value',
          'unit',
          'notes',
          'source',
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
    out_of_range: outOfRange.map((i) => i.field),
  });
}
