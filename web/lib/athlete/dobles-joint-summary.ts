import 'server-only';

// =============================================================================
// Dobles JOINT-SUMMARY builder — the side-by-side of ONE joint HYROX Dobles
// session, once BOTH athletes have logged it. Powers GET /api/athlete/dobles/
// joint-summary. A joint session is not a shared row: each athlete logs their OWN
// execution (own time / RPE / loads) and links the partner on it
// (workout_executions.partner_athlete_id, 0074 — see the log route). This reads
// BOTH reciprocal links and reports each side's real numbers.
//
// HONEST-NULL — never fabricate the other side. `partner` is null until the
// partner has actually logged their own execution for the same Madrid day.
//
// INJECTABLE CLIENT — the whole DB chain (partner resolution, both selects, the PR
// detector, the streak counts) runs on the ONE `client` passed in, so a test can
// drive it against a Neon branch. The route (composition root) calls it with the
// default pool; tests inject the branch client.
// =============================================================================

import type { Sql } from '@/lib/db';
import { SET_IS_WORKING } from '@/lib/execution/set-work';
import { sql as defaultSql } from '@/lib/db';
import { loadDoublesTrainingPartner } from '@/lib/athlete/doubles-training-partner';
import { detectExecutionRunningPRs } from '@/lib/sync/running-prs';
import { computeDoublesStreak } from '@/lib/athlete/dobles-streak';

/** One athlete's side of the summary. All fields honest-null when unrecorded. */
export interface JointSummarySide {
  name: string | null;
  total_time_s: number | null;
  rpe: number | null;
  pr_count: number;
  /** kg moved (Σ load×reps over the session's strength segments); null when the
   *  session logged no strength load — the field then hides on the client. */
  tonnage_kg: number | null;
}

export interface JointSummaryDTO {
  self: JointSummarySide;
  partner: JointSummarySide | null;
  joint_this_month: number;
  weeks_streak: number;
}

export type JointSummaryResult =
  | { ok: true; dto: JointSummaryDTO }
  | { ok: false; reason: 'no_partner' | 'not_joint' };

// One execution's stats. Tonnage: per-set working load when set_executions
// exist (skips and approach excluded, card 155); else the segment aggregate
// (weight_used_kg × reps_completed) for logs that never wrote sets. NULL when
// no strength load was logged.
interface ExecStatsRow {
  id: string;
  total_time_s: number | null;
  rpe: number | null;
  tonnage_kg: number | null;
}

/** First word of a full name, for the per-athlete display label (as the plan). */
function firstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

/** kg moved → whole kg for the wire; null stays null (session logged no load). */
function roundKgOrNull(v: number | null): number | null {
  return v === null ? null : Math.round(v);
}

/**
 * Build the joint-summary for the caller's assignment. `not_joint` when the
 * caller's execution is missing or doesn't link the CURRENT partner; `no_partner`
 * when there's no active Dobles training pair. Every DB call is threaded through
 * `client`.
 */
export async function buildJointSummary(
  args: { selfAthleteId: bigint; fullName: string | null; assignmentId: number },
  client: Sql = defaultSql,
): Promise<JointSummaryResult> {
  const selfAthleteId = Number(args.selfAthleteId);

  // A joint session needs an active Dobles TRAINING pair (doubles_pairs), not the
  // billing link. Threads the client so the resolver reads the same DB.
  const partner = await loadDoublesTrainingPartner(args.selfAthleteId, client);
  if (!partner) return { ok: false, reason: 'no_partner' };
  const partnerAthleteId = Number(partner.partner_athlete_id);

  // My own execution for this assignment. Must exist AND link the CURRENT partner,
  // else it isn't a joint session with this pair → not_joint. local_day anchors the
  // partner-side lookup to the same Madrid calendar day.
  const selfRows = await client<
    Array<ExecStatsRow & { partner_athlete_id: string | null; local_day: string }>
  >`
    select
      we.id::text as id,
      we.total_duration_seconds as total_time_s,
      we.perceived_exertion as rpe,
      we.partner_athlete_id::text as partner_athlete_id,
      to_char((coalesce(we.started_at, we.created_at) at time zone 'Europe/Madrid'), 'YYYY-MM-DD') as local_day,
      (
        select case
          when exists (
            select 1
            from set_executions st
            join segment_executions se on se.id = st.segment_execution_id
            where se.execution_id = we.id
          ) then (
            select sum(st.load_actual_kg * st.reps_actual)::float8
            from set_executions st
            join segment_executions se on se.id = st.segment_execution_id
            where se.execution_id = we.id
              and ${SET_IS_WORKING(client)}
              and st.load_actual_kg is not null
              and st.reps_actual is not null
          )
          else (
            select sum(coalesce(se.weight_used_kg, 0) * coalesce(se.reps_completed, 0))::float8
            from segment_executions se
            where se.execution_id = we.id and se.weight_used_kg is not null
          )
        end
      ) as tonnage_kg
    from workout_executions we
    where we.assignment_id = ${args.assignmentId} and we.athlete_id = ${selfAthleteId}
    limit 1
  `;
  const self = selfRows[0];
  if (!self || self.partner_athlete_id !== String(partnerAthleteId)) {
    return { ok: false, reason: 'not_joint' };
  }

  // The partner's OWN execution linking back to me on the SAME Madrid day. The
  // most recent that day when they logged more than once. Absent → honest null.
  const partnerRows = await client<Array<ExecStatsRow>>`
    select
      we.id::text as id,
      we.total_duration_seconds as total_time_s,
      we.perceived_exertion as rpe,
      (
        select case
          when exists (
            select 1
            from set_executions st
            join segment_executions se on se.id = st.segment_execution_id
            where se.execution_id = we.id
          ) then (
            select sum(st.load_actual_kg * st.reps_actual)::float8
            from set_executions st
            join segment_executions se on se.id = st.segment_execution_id
            where se.execution_id = we.id
              and ${SET_IS_WORKING(client)}
              and st.load_actual_kg is not null
              and st.reps_actual is not null
          )
          else (
            select sum(coalesce(se.weight_used_kg, 0) * coalesce(se.reps_completed, 0))::float8
            from segment_executions se
            where se.execution_id = we.id and se.weight_used_kg is not null
          )
        end
      ) as tonnage_kg
    from workout_executions we
    where we.athlete_id = ${partnerAthleteId}
      and we.partner_athlete_id = ${selfAthleteId}
      and to_char((coalesce(we.started_at, we.created_at) at time zone 'Europe/Madrid'), 'YYYY-MM-DD') = ${self.local_day}
    order by coalesce(we.started_at, we.created_at) desc
    limit 1
  `;
  const partnerExec = partnerRows[0] ?? null;

  // Running PRs (1k/3k/5k) each execution holds — reuses the shared close-time
  // detector (one query/side, threaded client). Live recompute: reads "still a PR
  // now" vs the athlete's other sessions, since PRs are not persisted to freeze.
  const selfPRs = await detectExecutionRunningPRs({
    sql: client,
    athleteId: selfAthleteId,
    executionId: Number(self.id),
  });
  const partnerPRs = partnerExec
    ? await detectExecutionRunningPRs({
        sql: client,
        athleteId: partnerAthleteId,
        executionId: Number(partnerExec.id),
      })
    : [];

  const counts = await computeDoublesStreak({ athleteId: args.selfAthleteId }, client);

  return {
    ok: true,
    dto: {
      self: {
        name: firstName(args.fullName),
        total_time_s: self.total_time_s,
        rpe: self.rpe,
        pr_count: selfPRs.length,
        tonnage_kg: roundKgOrNull(self.tonnage_kg),
      },
      partner: partnerExec
        ? {
            name: firstName(partner.partner_full_name),
            total_time_s: partnerExec.total_time_s,
            rpe: partnerExec.rpe,
            pr_count: partnerPRs.length,
            tonnage_kg: roundKgOrNull(partnerExec.tonnage_kg),
          }
        : null,
      joint_this_month: counts.joint_this_month,
      weeks_streak: counts.weeks_streak,
    },
  };
}
