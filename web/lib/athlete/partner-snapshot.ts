import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  addDays,
  isoDateString,
  mondayOfWeek,
  startOfDayInBox,
} from '@fahybrid/shared/domain/dates';
import { getActiveDoublesPairForAthlete } from '@/lib/dashboard/coach/doubles-pairs';

// =============================================================================
// PARTNER TRAINING SNAPSHOT — the data behind the iOS "Tu pareja" panel.
//
// Given an authed athlete, resolve the OTHER athlete in their active doubles_pair
// and return an HONEST snapshot of how the partner is doing: today's workout
// (done / pending), this week's progress, and the most recent completed sessions.
// Only REAL data — empty/null states are clean, nothing is faked.
//
// PRIVACY: only assignments the partner shares (workout_assignments.partner_visibility
// = 'shared', the default from 0021) are surfaced. A 'self_only' session is
// invisible to the partner.
// =============================================================================

export interface PartnerTodayWorkout {
  assignment_id: number;
  workout_name: string | null;
  status: 'scheduled' | 'completed' | 'missed' | 'skipped';
  // HYROX: the time IS the result. Surface the partner's recorded score so the
  // panel shows the OUTCOME, not just done/pending. score_time_s for For Time /
  // RFT / HYROX-sim; score_rounds (+ score_reps) for AMRAP. Null when the format
  // isn't scored, or there's no execution yet.
  score_time_s: number | null;
  score_rounds: number | null;
  score_reps: number | null;
  /** True when the partner logged THIS session as a joint "train together" with
   *  the viewing athlete (partner's execution.partner_athlete_id = the viewer). */
  trained_together: boolean;
}

export interface PartnerRecentSession {
  assignment_id: number;
  date: string;
  workout_name: string | null;
  status: 'completed' | 'missed' | 'skipped';
  duration_seconds: number | null;
  perceived_exertion: number | null;
  // HYROX: the time IS the result — the panel must show the score, not just the
  // status. Same score semantics as PartnerTodayWorkout; null = unscored / none.
  score_time_s: number | null;
  score_rounds: number | null;
  score_reps: number | null;
  /** True when the partner logged this session as a joint session with the viewer
   *  (partner's execution.partner_athlete_id = the viewing athlete). Drives the
   *  "Entrenasteis juntos" tag. */
  trained_together: boolean;
}

export interface PartnerTrainingSnapshot {
  athlete_id: number;
  full_name: string;
  /**
   * #13: the partner is EN PAUSA (athletes.lifecycle_status='pausado'). The iOS
   * "Tu pareja" panel keeps showing them, tagged "en pausa", instead of vanishing
   * or breaking. A partner who is de BAJA (or whose account was soft-deleted, or
   * whose pair was dissolved) does NOT reach here at all — buildPartnerSnapshot
   * returns null and the panel hides. So this flag is only ever true|false for a
   * still-present partner.
   */
  partner_paused: boolean;
  /** The partner's session scheduled for today (box tz), or null if none/private. */
  today: PartnerTodayWorkout | null;
  /** This week's shared-session progress (Mon–Sun, box tz). */
  week: { completed: number; total: number };
  /** Most recent finished sessions (newest first), up to RECENT_LIMIT. */
  recent: PartnerRecentSession[];
}

const RECENT_LIMIT = 3;
const TERMINAL_STATUSES = ['completed', 'missed', 'skipped'] as const;

/**
 * Build the partner snapshot for `athleteId`, or null when the athlete is not in
 * an active doubles pair (the iOS panel then hides). Resolves the pair via
 * getActiveDoublesPairForAthlete (membership-keyed, no coach scope needed).
 */
export async function buildPartnerSnapshot(
  athleteId: number | bigint,
  client: Sql = defaultSql,
): Promise<PartnerTrainingSnapshot | null> {
  const pair = await getActiveDoublesPairForAthlete(athleteId, client);
  if (!pair) return null;

  const partnerId = pair.partner_id;
  // The viewing athlete (normalized to a plain number by the pair resolver). Used
  // to detect sessions the partner logged AS a joint session with THIS viewer.
  const viewerId = pair.self_id;

  // Resolve the partner's display fields with the SAME lifecycle/deleted guards as
  // every other dobles surface (doubles-training-partner.ts:75). The partner is
  // GONE — panel hides, return null — when their account is soft-deleted
  // (users.deleted_at) OR they are de BAJA (athletes.lifecycle_status='baja'). The
  // pair-dissolved case is already handled upstream by getActiveDoublesPairForAthlete
  // (status='active'). A PAUSED partner (lifecycle_status='pausado') still resolves,
  // but is TAGGED (partner_paused) so the panel shows "en pausa" rather than break. (#13)
  const nameRows = await client<{ full_name: string; lifecycle_status: string }[]>`
    select a.full_name, a.lifecycle_status::text as lifecycle_status
    from athletes a
    join users u on u.id = a.user_id and u.deleted_at is null
    where a.id = ${partnerId}
      and a.lifecycle_status <> 'baja'
    limit 1
  `;
  if (nameRows.length === 0) return null; // partner deleted / de baja / vanished — hide panel
  const fullName = nameRows[0]!.full_name;
  const partnerPaused = nameRows[0]!.lifecycle_status === 'pausado';

  const today = startOfDayInBox(new Date());
  const todayIso = isoDateString(today);
  const weekStartIso = isoDateString(mondayOfWeek(today));
  const weekEndIso = isoDateString(addDays(mondayOfWeek(today), 6));

  const [todayRows, weekRows, recentRows] = await Promise.all([
    client<
      {
        assignment_id: string;
        workout_name: string | null;
        status: string;
        score_time_s: number | null;
        score_rounds: number | null;
        score_reps: number | null;
        trained_together: boolean;
      }[]
    >`
      select wa.id::text as assignment_id,
             t.name as workout_name,
             wa.status::text as status,
             we.score_time_s as score_time_s,
             we.score_rounds as score_rounds,
             we.score_reps as score_reps,
             coalesce(we.partner_athlete_id = ${viewerId}, false) as trained_together
      from workout_assignments wa
      left join templates t on t.id = wa.template_id
      left join workout_executions we on we.assignment_id = wa.id
      where wa.athlete_id = ${partnerId}
        and wa.scheduled_for = ${todayIso}::date
        and wa.partner_visibility = 'shared'
      order by wa.id asc
      limit 1
    `,
    client<{ completed: number; total: number }[]>`
      select
        count(*) filter (where status = 'completed')::int as completed,
        count(*)::int as total
      from workout_assignments
      where athlete_id = ${partnerId}
        and scheduled_for >= ${weekStartIso}::date
        and scheduled_for <= ${weekEndIso}::date
        and partner_visibility = 'shared'
    `,
    client<
      {
        assignment_id: string;
        date: string;
        workout_name: string | null;
        status: string;
        duration_seconds: number | null;
        perceived_exertion: number | null;
        score_time_s: number | null;
        score_rounds: number | null;
        score_reps: number | null;
        trained_together: boolean;
      }[]
    >`
      select wa.id::text as assignment_id,
             to_char(wa.scheduled_for, 'YYYY-MM-DD') as date,
             t.name as workout_name,
             wa.status::text as status,
             we.total_duration_seconds as duration_seconds,
             we.perceived_exertion as perceived_exertion,
             we.score_time_s as score_time_s,
             we.score_rounds as score_rounds,
             we.score_reps as score_reps,
             coalesce(we.partner_athlete_id = ${viewerId}, false) as trained_together
      from workout_assignments wa
      left join templates t on t.id = wa.template_id
      left join workout_executions we on we.assignment_id = wa.id
      where wa.athlete_id = ${partnerId}
        and wa.partner_visibility = 'shared'
        and wa.scheduled_for <= ${todayIso}::date
        and wa.status = any(${TERMINAL_STATUSES as unknown as string[]}::assignment_status[])
      order by wa.scheduled_for desc, wa.id desc
      limit ${RECENT_LIMIT}
    `,
  ]);

  const todayRow = todayRows[0];
  const weekRow = weekRows[0] ?? { completed: 0, total: 0 };

  return {
    athlete_id: partnerId,
    full_name: fullName,
    partner_paused: partnerPaused,
    today: todayRow
      ? {
          assignment_id: Number(todayRow.assignment_id),
          workout_name: todayRow.workout_name,
          status: todayRow.status as PartnerTodayWorkout['status'],
          score_time_s: todayRow.score_time_s,
          score_rounds: todayRow.score_rounds,
          score_reps: todayRow.score_reps,
          trained_together: todayRow.trained_together,
        }
      : null,
    week: { completed: weekRow.completed, total: weekRow.total },
    recent: recentRows.map((r) => ({
      assignment_id: Number(r.assignment_id),
      date: r.date,
      workout_name: r.workout_name,
      status: r.status as PartnerRecentSession['status'],
      duration_seconds: r.duration_seconds,
      perceived_exertion: r.perceived_exertion,
      score_time_s: r.score_time_s,
      score_rounds: r.score_rounds,
      score_reps: r.score_reps,
      trained_together: r.trained_together,
    })),
  };
}
