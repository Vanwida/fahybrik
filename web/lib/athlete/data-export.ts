// =============================================================================
// RGPD / Apple Guideline 5.1.1(v) — athlete data export
//
// Aggregates *every* personal-data table the athlete owns into one JSON
// document. The endpoint streams this as an attachment so the user has a
// complete take-home copy of what we hold on them.
//
// What we INCLUDE:
//   - users row (sans password hash / internal tokens)
//   - athletes row (full profile incl. injuries, intake notes)
//   - subscription (own + linked-via-partner)
//   - partner basic identity (name only — for context, not their data)
//   - planned + executed workouts (workout_assignments / workout_executions)
//   - race plans, results, debriefs
//   - biometric streams (HealthKit / Garmin / Concept2 raw values)
//   - daily check-ins
//   - weekly_plans (Dobles plan history)
//   - chat threads + every message the athlete sent OR received in their
//     threads (the coach's user_id is redacted to a `sender_role` so we never
//     leak third-party PII through an athlete's own export — M5)
//   - notifications inbox
//   - athlete_daily_readiness_snapshots (model outputs derived from their data)
//
// What we DO NOT include:
//   - magic_link_tokens (security tokens, not user data)
//   - sessions / apns_push_tokens (security tokens, not user data)
//   - apple_user_id (internal identifier, not requested)
//   - audit_log (internal — RGPD covers user data, not our access logs)
//   - methodology_* (Pablo's IP, not athlete data)
// =============================================================================

import type { Sql } from '@/lib/db';

export interface AthleteDataExport {
  exported_at: string;
  user: ExportedUser | null;
  athlete: ExportedAthlete | null;
  subscription: ExportedSubscription | null;
  partner: ExportedPartner | null;
  workouts_planned: Array<Record<string, unknown>>;
  workouts_executed: Array<Record<string, unknown>>;
  race_plans: Array<Record<string, unknown>>;
  race_results: Array<Record<string, unknown>>;
  race_debriefs: Array<Record<string, unknown>>;
  biometric_streams: Array<Record<string, unknown>>;
  daily_checkins: Array<Record<string, unknown>>;
  weekly_plans: Array<Record<string, unknown>>;
  chat_threads: Array<Record<string, unknown>>;
  chat_messages: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  athlete_target_events: Array<Record<string, unknown>>;
  athlete_readiness_snapshots: Array<Record<string, unknown>>;
  athlete_benchmarks: Array<Record<string, unknown>>;
}

export interface ExportedUser {
  id: string;
  email: string;
  role: string;
  partner_id: string | null;
  box_member: boolean;
  idioma: string;
  box_class_schedule: unknown;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
  deleted_at: string | null;
}

export interface ExportedAthlete {
  id: string;
  user_id: string;
  coach_id: string | null;
  full_name: string;
  dob: string | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  training_experience_years: number | null;
  primary_discipline: string | null;
  training_days_per_week: number | null;
  equipment_access: string | null;
  injuries_json: unknown;
  intake_completed_at: string | null;
  intake_notes_json: unknown;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportedSubscription {
  id: string;
  plan_type: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  partner_user_id: string | null;
  created_at: string;
}

export interface ExportedPartner {
  id: string;
  full_name: string | null;
}

export interface ExportAthleteDataInput {
  sql: Sql;
  athlete_id: bigint;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export async function exportAthleteData(
  input: ExportAthleteDataInput,
): Promise<AthleteDataExport> {
  const { sql, athlete_id } = input;
  const athleteIdNum = athlete_id as unknown as number;

  // 1) Athlete + user (single query; we own one user_id per athlete).
  const athleteRows = await sql<
    Array<{
      athlete_id: string;
      user_id: string;
      coach_id: string | null;
      full_name: string;
      dob: string | null;
      sex: string | null;
      height_cm: number | null;
      weight_kg: number | null;
      body_fat_pct: number | null;
      training_experience_years: number | null;
      primary_discipline: string | null;
      training_days_per_week: number | null;
      equipment_access: string | null;
      injuries_json: unknown;
      intake_completed_at: string | null;
      intake_notes_json: unknown;
      onboarded_at: string | null;
      athlete_created_at: string;
      athlete_updated_at: string;
      email: string;
      role: string;
      partner_id: string | null;
      box_member: boolean;
      idioma: string;
      box_class_schedule: unknown;
      user_created_at: string;
      user_updated_at: string;
      last_seen_at: string | null;
      deleted_at: string | null;
    }>
  >`
    select
      a.id::text                          as athlete_id,
      a.user_id::text                     as user_id,
      a.coach_id::text                    as coach_id,
      a.full_name                         as full_name,
      to_char(a.dob, 'YYYY-MM-DD')        as dob,
      a.sex::text                         as sex,
      a.height_cm::float                  as height_cm,
      a.weight_kg::float                  as weight_kg,
      a.body_fat_pct::float               as body_fat_pct,
      a.training_experience_years::float  as training_experience_years,
      a.primary_discipline::text          as primary_discipline,
      a.training_days_per_week            as training_days_per_week,
      a.equipment_access::text            as equipment_access,
      a.injuries_json                     as injuries_json,
      a.intake_completed_at::text         as intake_completed_at,
      a.intake_notes_json                 as intake_notes_json,
      a.onboarded_at::text                as onboarded_at,
      a.created_at::text                  as athlete_created_at,
      a.updated_at::text                  as athlete_updated_at,
      u.email                             as email,
      u.role::text                        as role,
      u.partner_id::text                  as partner_id,
      u.box_member                        as box_member,
      u.idioma::text                      as idioma,
      u.box_class_schedule                as box_class_schedule,
      u.created_at::text                  as user_created_at,
      u.updated_at::text                  as user_updated_at,
      u.last_seen_at::text                as last_seen_at,
      u.deleted_at::text                  as deleted_at
    from athletes a
    join users u on u.id = a.user_id
    where a.id = ${athleteIdNum}
    limit 1
  `;
  const head = athleteRows[0] ?? null;
  const userId = head ? head.user_id : null;

  // 2) Subscription (user_id-scoped — the new dobles-aware table).
  const subscriptions = userId
    ? await sql<
        Array<{
          id: string;
          plan_type: string;
          status: string;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          partner_user_id: string | null;
          created_at: string;
        }>
      >`
        select
          id::text                            as id,
          plan_type                           as plan_type,
          status::text                        as status,
          current_period_end::text            as current_period_end,
          cancel_at_period_end                as cancel_at_period_end,
          partner_user_id::text               as partner_user_id,
          created_at::text                    as created_at
        from subscriptions
        where user_id = ${userId}::bigint
        order by created_at desc
        limit 5
      `
    : [];

  // 3) Partner (only the public identity — name. We do NOT dump the
  // partner's data through this athlete's export).
  const partner =
    head?.partner_id != null
      ? (
          await sql<Array<{ id: string; full_name: string | null }>>`
            select u.id::text as id, a.full_name as full_name
            from users u
            left join athletes a on a.user_id = u.id
            where u.id = ${head.partner_id}::bigint
            limit 1
          `
        )[0] ?? null
      : null;

  // 4-9) Independent, athlete-/user-scoped datasets. These have no
  // dependencies on each other, so we issue them concurrently (M4) to avoid
  // serial round-trip latency stacking up past the serverless timeout. Chat
  // messages are the one exception — they depend on chat_threads — so they're
  // fetched in a second step below.
  const [
    workoutsPlanned,
    workoutsExecuted,
    racePlans,
    raceResults,
    raceDebriefs,
    biometricStreams,
    dailyCheckins,
    weeklyPlans,
    chatThreads,
    notifications,
    athleteTargetEvents,
    athleteReadiness,
    athleteBenchmarks,
  ] = await Promise.all([
    // 4) Plan + executions — own data, scoped by athlete_id.
    sql`
      select
        id::text                            as id,
        microcycle_id::text                 as microcycle_id,
        to_char(scheduled_for, 'YYYY-MM-DD') as scheduled_for,
        status::text                        as status,
        template_id::text                   as template_id,
        template_version                    as template_version,
        notes                               as notes,
        partner_visibility                  as partner_visibility,
        station_assignment                  as station_assignment,
        created_at::text                    as created_at
      from workout_assignments
      where athlete_id = ${athleteIdNum}
      order by scheduled_for desc, id desc
    `,
    sql`
      select
        id::text                            as id,
        assignment_id::text                 as assignment_id,
        started_at::text                    as started_at,
        ended_at::text                      as ended_at,
        total_duration_seconds              as total_duration_seconds,
        perceived_exertion                  as perceived_exertion,
        notes                               as notes,
        created_at::text                    as created_at
      from workout_executions
      where athlete_id = ${athleteIdNum}
      order by started_at desc nulls last, id desc
    `,
    // 5) Race plans / results / debriefs.
    sql`select * from race_plans where athlete_id = ${athleteIdNum} order by id desc`,
    sql`select * from race_results where athlete_id = ${athleteIdNum} order by id desc`,
    sql`select * from race_debriefs where athlete_id = ${athleteIdNum} order by id desc`,
    // 6) Biometric streams — full export. Coach-only summaries are derived,
    // the raw is what RGPD requires.
    sql`
      select
        id::text                            as id,
        source::text                        as source,
        source_workout_id                   as source_workout_id,
        metric_type::text                   as metric_type,
        recorded_at::text                   as recorded_at,
        value_numeric::float                as value_numeric,
        unit                                as unit,
        raw_payload_json                    as raw_payload_json,
        created_at::text                    as created_at
      from biometric_streams
      where athlete_id = ${athleteIdNum}
      order by recorded_at desc
    `,
    sql`select * from daily_checkins where athlete_id = ${athleteIdNum} order by recorded_for desc`,
    sql`
      select
        id::text                            as id,
        microcycle_id::text                 as microcycle_id,
        to_char(week_start, 'YYYY-MM-DD')   as week_start,
        status::text                        as status,
        ia_proposed                         as ia_proposed,
        approved_by::text                   as approved_by,
        shared                              as shared,
        notes                               as notes,
        created_at::text                    as created_at,
        updated_at::text                    as updated_at
      from weekly_plans
      where athlete_id = ${athleteIdNum}
      order by week_start desc
    `,
    // 7) Chat threads (messages depend on these — fetched after).
    sql`
      select
        id::text                            as id,
        coach_id::text                      as coach_id,
        last_message_at::text               as last_message_at,
        created_at::text                    as created_at
      from chat_threads
      where athlete_id = ${athleteIdNum}
      order by last_message_at desc nulls last, id desc
    `,
    // 8) Inbox — anything the user has been notified about.
    userId
      ? sql`
          select
            id::text                            as id,
            type::text                          as type,
            payload_json                        as payload_json,
            created_at::text                    as created_at,
            read_at::text                       as read_at
          from notifications
          where user_id = ${userId}::bigint
          order by created_at desc
        `
      : Promise.resolve([] as Array<Record<string, unknown>>),
    // 9) Target events + readiness snapshots + benchmarks.
    sql`select * from athlete_target_events where athlete_id = ${athleteIdNum} order by id desc`,
    sql`
      select
        id::text                            as id,
        to_char(recorded_for, 'YYYY-MM-DD') as recorded_for,
        score                               as score,
        created_at::text                    as created_at
      from athlete_daily_readiness_snapshots
      where athlete_id = ${athleteIdNum}
      order by recorded_for desc
    `,
    sql`
      select
        id::text                            as id,
        exercise_slug                       as exercise_slug,
        value::float                        as value,
        unit                                as unit,
        recorded_at::text                   as recorded_at,
        notes                               as notes,
        created_at::text                    as created_at
      from athlete_benchmarks
      where athlete_id = ${athleteIdNum}
      order by recorded_at desc
    `,
  ]);

  // 7b) Chat messages — both directions. RGPD covers messages the athlete sent
  // AND received. M5: we do NOT expose the coach's user_id (third-party PII) in
  // the athlete's own export. Instead each message is tagged with a sender role
  // ('athlete' for the athlete's own user, otherwise 'coach') and the raw
  // sender_user_id is dropped.
  const chatMessagesRaw =
    chatThreads.length > 0
      ? await sql<
          Array<{
            id: string;
            thread_id: string;
            sender_user_id: string | null;
            body: string | null;
            created_at: string | null;
            read_at: string | null;
            edited_at: string | null;
            deleted_at: string | null;
          }>
        >`
          select
            m.id::text                          as id,
            m.thread_id::text                   as thread_id,
            m.sender_user_id::text              as sender_user_id,
            m.body                              as body,
            m.created_at::text                  as created_at,
            m.read_at::text                     as read_at,
            m.edited_at::text                   as edited_at,
            m.deleted_at::text                  as deleted_at
          from chat_messages m
          join chat_threads t on t.id = m.thread_id
          where t.athlete_id = ${athleteIdNum}
          order by m.created_at asc
        `
      : [];
  const chatMessages = chatMessagesRaw.map((m) => {
    const { sender_user_id, ...rest } = m;
    return {
      ...rest,
      sender_role: userId != null && sender_user_id === userId ? 'athlete' : 'coach',
    };
  });

  return {
    exported_at: new Date().toISOString(),
    user: head
      ? {
          id: head.user_id,
          email: head.email,
          role: head.role,
          partner_id: head.partner_id,
          box_member: head.box_member,
          idioma: head.idioma,
          box_class_schedule: head.box_class_schedule,
          created_at: head.user_created_at,
          updated_at: head.user_updated_at,
          last_seen_at: head.last_seen_at,
          deleted_at: head.deleted_at,
        }
      : null,
    athlete: head
      ? {
          id: head.athlete_id,
          user_id: head.user_id,
          coach_id: head.coach_id,
          full_name: head.full_name,
          dob: head.dob,
          sex: head.sex,
          height_cm: head.height_cm,
          weight_kg: head.weight_kg,
          body_fat_pct: head.body_fat_pct,
          training_experience_years: head.training_experience_years,
          primary_discipline: head.primary_discipline,
          training_days_per_week: head.training_days_per_week,
          equipment_access: head.equipment_access,
          injuries_json: head.injuries_json,
          intake_completed_at: head.intake_completed_at,
          intake_notes_json: head.intake_notes_json,
          onboarded_at: head.onboarded_at,
          created_at: head.athlete_created_at,
          updated_at: head.athlete_updated_at,
        }
      : null,
    subscription: subscriptions[0] ?? null,
    partner: partner ?? null,
    workouts_planned: workoutsPlanned as Array<Record<string, unknown>>,
    workouts_executed: workoutsExecuted as Array<Record<string, unknown>>,
    race_plans: racePlans as Array<Record<string, unknown>>,
    race_results: raceResults as Array<Record<string, unknown>>,
    race_debriefs: raceDebriefs as Array<Record<string, unknown>>,
    biometric_streams: biometricStreams as Array<Record<string, unknown>>,
    daily_checkins: dailyCheckins as Array<Record<string, unknown>>,
    weekly_plans: weeklyPlans as Array<Record<string, unknown>>,
    chat_threads: chatThreads as Array<Record<string, unknown>>,
    chat_messages: chatMessages as Array<Record<string, unknown>>,
    notifications: notifications as Array<Record<string, unknown>>,
    athlete_target_events: athleteTargetEvents as Array<Record<string, unknown>>,
    athlete_readiness_snapshots: athleteReadiness as Array<Record<string, unknown>>,
    athlete_benchmarks: athleteBenchmarks as Array<Record<string, unknown>>,
  };
}
