import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isIntakePending } from '@fahybrid/shared/domain/coach/intake-pending';
import { getTargetRaceRow } from '@fahybrid/shared/domain/coach/target-race';
import { getLatestReadiness } from '@fahybrid/shared/domain/coach/athlete-daily-readiness';
import { formatExecutionScore } from '@/lib/dashboard/coach/athlete-session-adapter';

export type ReadinessLabel = 'READY' | 'CAUTION' | 'LOW';

export type AthleteModality = 'individual' | 'dobles' | 'pro_elite';

/** How many recent joint ("Entrenar juntos") sessions to surface on the coach detail. */
const JOINT_SESSIONS_LIMIT = 8;

/**
 * A single JOINT HYROX Dobles session seen from ONE athlete's side: their own
 * result next to the PARTNER's real result for the SAME shared session. The two are
 * matched by the reciprocal 0074 link (each execution's partner_athlete_id points at
 * the other athlete) on the SAME scheduled day. Scores are pre-formatted via the
 * single-source formatExecutionScore — in HYROX the TIME is the result. partner_*
 * stays null until the partner logs their own execution (honest partial state);
 * we NEVER fabricate the partner's numbers from one device.
 */
export interface JointSession {
  /** Shared session day (YYYY-MM-DD, the scheduled_for the two assignments share). */
  date: string;
  session_name: string | null;
  partner_name: string | null;
  /** The viewed athlete's formatted score ("42:15", "5 rondas + 8 reps"); null = unscored. */
  self_score: string | null;
  /** The partner's formatted score; null until they log their side / unscored format. */
  partner_score: string | null;
  self_duration_s: number | null;
  partner_duration_s: number | null;
}

export type AthleteProfileShell = {
  athlete_id: string;
  full_name: string;
  /** Current microciclo NAME (coach data), null when none active. */
  block_type: string | null;
  block_week: number | null;
  readiness_score: number | null;
  readiness_label: ReadinessLabel | null;
  a_event: { name: string; iso_date: string; days_until: number } | null;
  /** Current microciclo NAME (coach data), null when none active. */
  macro_block: string | null;
  /** Athlete finished onboarding but the coach hasn't reviewed intake yet. */
  intake_pending: boolean;
  /** Real account/onboarding timestamp (ISO) — the single base for tenure ("alta
   *  hace N"). null when never onboarded. NOT a plan-start proxy. */
  onboarded_at: string | null;
  /** Alta authorship (#43): the coach who created the athlete + when (ISO), for the
   *  "Alta por X · hace Y" sello. null when unattributed (historical rows). */
  alta_by_name: string | null;
  alta_at: string | null;
  /** Last profile edit authorship (#43): who + when (ISO). null when never edited. */
  edited_by_name: string | null;
  edited_at: string | null;
  /** Modalidad de plan (suscripción más reciente) — null si aún no hay suscripción. */
  modality: AthleteModality | null;
  /** Real level name from athlete_levels.name (e.g. 'N1'–'N5'); null when not assigned. */
  level_name: string | null;
  /** sort_order from athlete_levels for ranking; 0 when null. */
  level_sort: number;
  /** Pareja de Dobles (users.partner_id → atleta del mismo coach), null si no aplica. */
  partner: { athlete_id: string; full_name: string } | null;
  /** JOINT "Entrenar juntos" sessions this athlete logged with a partner — both
   *  athletes' REAL results side by side, newest first. Empty when none. */
  joint_sessions: JointSession[];
};

function readinessLabel(score: number | null): ReadinessLabel | null {
  if (score == null) return null;
  if (score >= 70) return 'READY';
  if (score >= 45) return 'CAUTION';
  return 'LOW';
}

export async function fetchAthleteProfileShell(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<AthleteProfileShell | null> {
  const client = params.client ?? defaultSql;

  const rows = await client<
    Array<{
      id: string;
      full_name: string;
      level_name: string | null;
      level_sort: number;
      block_type: string | null;
      block_week: number | null;
      onboarded_at: Date | null;
      intake_completed_at: Date | null;
      created_at: Date | null;
      updated_at: Date | null;
      alta_by_name: string | null;
      edited_by_name: string | null;
      modality: string | null;
      partner_athlete_id: string | null;
      partner_full_name: string | null;
    }>
  >`
    select
      a.id::text,
      a.full_name,
      al.name as level_name,
      coalesce(al.sort_order, 0)::int as level_sort,
      ab.block_type as block_type,
      ab.block_week as block_week,
      a.onboarded_at,
      a.intake_completed_at,
      a.created_at,
      a.updated_at,
      cu.full_name as alta_by_name,
      eu.full_name as edited_by_name,
      sub.plan_type as modality,
      pa.id::text as partner_athlete_id,
      pa.full_name as partner_full_name
    from athletes a
    left join athlete_levels al on al.id = a.level_id
    left join users cu on cu.id = a.created_by_user_id
    left join users eu on eu.id = a.last_edited_by_user_id
    left join lateral (
      select s.plan_type
      from subscriptions s
      where s.user_id = a.user_id
      -- Prefer the live (active) subscription so modality reflects current
      -- access; fall back to the most recent otherwise (same rule as roster).
      order by (s.status = 'active') desc, s.created_at desc
      limit 1
    ) sub on true
    left join users u on u.id = a.user_id
    left join athletes pa
      on pa.user_id = u.partner_id and pa.coach_id = a.coach_id
    left join lateral (
      -- Current microciclo (AGNOSTIC): the assignment receipt whose dated window
      -- contains today → its template NAME + the 1-based week within that window.
      select
        m.name as block_type,
        greatest(
          1,
          (floor((current_date - date_trunc('week', ama.start_date)::date) / 7) + 1)::int
        ) as block_week
      from athlete_month_assignments ama
      join program_month_templates m on m.id = ama.month_template_id
      where ama.athlete_id = a.id
        and current_date between ama.start_date and ama.end_date
      order by ama.start_date desc
      limit 1
    ) ab on true
    where a.id = ${params.athlete_id} and a.coach_id = ${params.coach_id}
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  // Target race = soonest upcoming race with priority='target' (unified spine).
  const targetRace = await getTargetRaceRow(params.athlete_id, client);

  // Readiness via the shared motor (compute-on-miss + recorded_for <= today) so
  // the coach sees the SAME live score the athlete's own surface computes.
  const readiness = await getLatestReadiness({ athlete_id: params.athlete_id, client });
  const readinessScore = readiness?.score ?? null;

  // Joint ("Entrenar juntos") sessions — degrade to [] on a read failure so the
  // shell (the ownership gate) never 500s over a secondary panel.
  const jointSessions = await loadJointSessions({
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
    client,
  }).catch(() => []);

  const blockType = row.block_type ?? null;

  return {
    athlete_id: row.id,
    full_name: row.full_name,
    block_type: blockType,
    block_week: row.block_week,
    readiness_score: readinessScore,
    readiness_label: readinessLabel(readinessScore),
    a_event: targetRace
      ? { name: targetRace.name, iso_date: targetRace.race_date, days_until: targetRace.days_until }
      : null,
    macro_block: blockType,
    intake_pending: isIntakePending({
      onboarded_at: row.onboarded_at,
      intake_completed_at: row.intake_completed_at,
    }),
    onboarded_at: row.onboarded_at ? row.onboarded_at.toISOString() : null,
    alta_by_name: row.alta_by_name,
    alta_at: row.created_at ? row.created_at.toISOString() : null,
    edited_by_name: row.edited_by_name,
    // Only surface an edit time when there is a recorded editor — updated_at is
    // bumped by triggers for reasons unrelated to a human edit.
    edited_at: row.edited_by_name && row.updated_at ? row.updated_at.toISOString() : null,
    modality: isAthleteModality(row.modality) ? row.modality : null,
    level_name: row.level_name,
    level_sort: row.level_sort,
    partner:
      row.partner_athlete_id && row.partner_full_name
        ? { athlete_id: row.partner_athlete_id, full_name: row.partner_full_name }
        : null,
    joint_sessions: jointSessions,
  };
}

function isAthleteModality(value: string | null): value is AthleteModality {
  return value === 'individual' || value === 'dobles' || value === 'pro_elite';
}

/**
 * Joint ("Entrenar juntos") sessions for an athlete: each of THEIR executions that
 * carries a 0074 partner link, paired with the PARTNER's reciprocal execution for
 * the SAME shared session — matched by the reciprocal link (we2 points back at this
 * athlete) on the SAME scheduled day. Coach-scoped: the partner must be one of THIS
 * coach's athletes (a doubles/billing partner always is), so no cross-coach name
 * leaks. Newest first, capped at JOINT_SESSIONS_LIMIT. Scores are pre-formatted via
 * the single-source formatExecutionScore; partner_* is null until they log.
 */
async function loadJointSessions(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client: Sql;
}): Promise<JointSession[]> {
  const { coach_id, athlete_id, client } = params;

  const rows = await client<
    Array<{
      date: string;
      session_name: string | null;
      partner_name: string | null;
      self_score_time_s: number | null;
      self_score_rounds: number | null;
      self_score_reps: number | null;
      self_duration_s: number | null;
      partner_score_time_s: number | null;
      partner_score_rounds: number | null;
      partner_score_reps: number | null;
      partner_duration_s: number | null;
    }>
  >`
    select
      to_char(wa1.scheduled_for, 'YYYY-MM-DD') as date,
      t1.name as session_name,
      pa.full_name as partner_name,
      we1.score_time_s as self_score_time_s,
      we1.score_rounds as self_score_rounds,
      we1.score_reps as self_score_reps,
      we1.total_duration_seconds as self_duration_s,
      we2.score_time_s as partner_score_time_s,
      we2.score_rounds as partner_score_rounds,
      we2.score_reps as partner_score_reps,
      we2.total_duration_seconds as partner_duration_s
    from workout_executions we1
    join workout_assignments wa1 on wa1.id = we1.assignment_id
    left join templates t1 on t1.id = wa1.template_id
    join athletes pa
      on pa.id = we1.partner_athlete_id and pa.coach_id = ${coach_id}
    left join lateral (
      -- The partner's reciprocal execution for the SAME shared session: they linked
      -- back to this athlete, on the same scheduled day. Latest wins on ties.
      select we2.score_time_s, we2.score_rounds, we2.score_reps,
             we2.total_duration_seconds
      from workout_executions we2
      join workout_assignments wa2 on wa2.id = we2.assignment_id
      where we2.athlete_id = we1.partner_athlete_id
        and we2.partner_athlete_id = we1.athlete_id
        and wa2.scheduled_for = wa1.scheduled_for
      order by we2.id desc
      limit 1
    ) we2 on true
    where we1.athlete_id = ${athlete_id}
      and we1.partner_athlete_id is not null
    order by wa1.scheduled_for desc, we1.id desc
    limit ${JOINT_SESSIONS_LIMIT}
  `;

  return rows.map((r) => ({
    date: r.date,
    session_name: r.session_name,
    partner_name: r.partner_name,
    self_score: formatExecutionScore({
      score_time_s: r.self_score_time_s,
      score_rounds: r.self_score_rounds,
      score_reps: r.self_score_reps,
    }),
    partner_score: formatExecutionScore({
      score_time_s: r.partner_score_time_s,
      score_rounds: r.partner_score_rounds,
      score_reps: r.partner_score_reps,
    }),
    self_duration_s: r.self_duration_s,
    partner_duration_s: r.partner_duration_s,
  }));
}
