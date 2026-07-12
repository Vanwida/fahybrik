// GET /api/athlete/dobles/joint-summary?assignment_id=N
//
// The side-by-side summary of ONE joint HYROX Dobles session, shown once BOTH
// athletes have logged it. A joint session is not a shared row: each athlete logs
// their OWN execution (own time / RPE / loads) and links the partner on it
// (workout_executions.partner_athlete_id, 0074 — see the log route). This reads
// BOTH reciprocal links and reports each side's real numbers.
//
// HONEST-NULL — we never fabricate the other side. `partner` is null until the
// partner has actually logged their own execution for the same day; the self side
// is always the caller's real execution.
//
// Auth: athlete bearer. Requires an active Dobles TRAINING pair (else 404
// no_partner — without one it isn't a joint session). The [assignment_id] must be
// the caller's OWN assignment whose execution links THIS partner (else 404
// not_joint — the caller logged it solo, or it belongs to a different pairing).

import type { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { loadDoublesTrainingPartner } from '@/lib/athlete/doubles-training-partner';
import { detectExecutionRunningPRs } from '@/lib/sync/running-prs';
import { computeDoublesStreak } from '@/lib/athlete/dobles-streak';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const assignmentIdSchema = z.coerce.bigint().positive();

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

// One execution's stats, tonnage folded in as a correlated sum over the session's
// strength segments (real loads: weight_used_kg × reps_completed, mig 0001 — the
// same formula the coach deep-dive uses). NULL when no strength load was logged.
interface ExecStatsRow {
  id: string;
  total_time_s: number | null;
  rpe: number | null;
  tonnage_kg: number | null;
}

export async function GET(
  request: Request,
): Promise<NextResponse<JointSummaryDTO | ApiError>> {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  const parsedId = assignmentIdSchema.safeParse(
    new URL(request.url).searchParams.get('assignment_id'),
  );
  if (!parsedId.success) {
    return jsonError('invalid_request', 'Invalid assignment id', 400);
  }
  const assignmentId = Number(parsedId.data);
  const selfAthleteId = Number(auth.athlete_id);

  // A joint session needs an active Dobles TRAINING pair (doubles_pairs), not the
  // billing link — honest 404 when there's none.
  const partner = await loadDoublesTrainingPartner(auth.athlete_id);
  if (!partner) {
    return jsonError('no_partner', 'No linked partner for this athlete', 404);
  }
  const partnerAthleteId = Number(partner.partner_athlete_id);

  // My own execution for this assignment. Must exist AND link the CURRENT partner,
  // else it isn't a joint session with this pair → 404 not_joint. local_day anchors
  // the partner-side lookup to the same Madrid calendar day.
  const selfRows = await sql<Array<ExecStatsRow & { partner_athlete_id: string | null; local_day: string }>>`
    select
      we.id::text as id,
      we.total_duration_seconds as total_time_s,
      we.perceived_exertion as rpe,
      we.partner_athlete_id::text as partner_athlete_id,
      to_char((coalesce(we.started_at, we.created_at) at time zone 'Europe/Madrid'), 'YYYY-MM-DD') as local_day,
      (
        select sum(coalesce(se.weight_used_kg, 0) * coalesce(se.reps_completed, 0))
        from segment_executions se
        where se.execution_id = we.id and se.weight_used_kg is not null
      )::float8 as tonnage_kg
    from workout_executions we
    where we.assignment_id = ${assignmentId} and we.athlete_id = ${selfAthleteId}
    limit 1
  `;
  const self = selfRows[0];
  if (!self || self.partner_athlete_id !== String(partnerAthleteId)) {
    return jsonError('not_joint', 'No joint execution for this assignment', 404);
  }

  // The partner's OWN execution linking back to me on the SAME Madrid day. The
  // most recent that day when they logged more than once. Absent → honest null.
  const partnerRows = await sql<Array<ExecStatsRow>>`
    select
      we.id::text as id,
      we.total_duration_seconds as total_time_s,
      we.perceived_exertion as rpe,
      (
        select sum(coalesce(se.weight_used_kg, 0) * coalesce(se.reps_completed, 0))
        from segment_executions se
        where se.execution_id = we.id and se.weight_used_kg is not null
      )::float8 as tonnage_kg
    from workout_executions we
    where we.athlete_id = ${partnerAthleteId}
      and we.partner_athlete_id = ${selfAthleteId}
      and to_char((coalesce(we.started_at, we.created_at) at time zone 'Europe/Madrid'), 'YYYY-MM-DD') = ${self.local_day}
    order by coalesce(we.started_at, we.created_at) desc
    limit 1
  `;
  const partnerExec = partnerRows[0] ?? null;

  // Running PRs (1k/3k/5k) each execution holds — reuses the shared close-time
  // detector (one query/side). Live recompute: this reads "still a PR now" vs the
  // athlete's other sessions, since PRs are not persisted anywhere to freeze.
  const selfPRs = await detectExecutionRunningPRs({
    sql,
    athleteId: selfAthleteId,
    executionId: Number(self.id),
  });
  const partnerPRs = partnerExec
    ? await detectExecutionRunningPRs({
        sql,
        athleteId: partnerAthleteId,
        executionId: Number(partnerExec.id),
      })
    : [];

  const counts = await computeDoublesStreak({ athleteId: auth.athlete_id });

  return jsonOk<JointSummaryDTO>({
    self: {
      name: firstName(auth.full_name),
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
  });
}
