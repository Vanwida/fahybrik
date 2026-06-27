import 'server-only';

// Publish an ASSIGNED microciclo (an `athlete_month_assignments` row) to its
// athlete in ONE action — the athlete-scoped publish surface for the V2 plan.
//
// A microciclo template (`program_month_templates`) is NOT athlete-facing and has
// no draft/published state; the publish lifecycle lives per athlete-week in
// `weekly_plans`. When a microciclo is assigned (assign-draft / assign-month) it
// is materialized into `microcycles` + `workout_assignments`, and its weeks are
// gated by `weekly_plans.status`. "Publishing the microciclo" = flipping every one
// of those weeks to 'published' so the athlete plan endpoint stops hiding them.
//
// This module does NOT re-materialize (the materializer is not dedupe-safe). It
// reuses `publishBlock` verbatim (idempotent upsert + single notification), so
// re-publishing never duplicates anything. The empty-microciclo GATE rejects
// publishing a microciclo with no materialized weeks/sessions — there is nothing
// to deliver.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import {
  publishBlock,
  PublishWeekError,
  type PublishBlockResult,
} from '@/lib/coach/publish-week';

/** Publish state of the athlete's current-or-next microciclo, for the plan badge
 *  + the Publicar action. Derived from `weekly_plans` over the microciclo's weeks:
 *  a week with no row reads as visible (published) per the athlete plan gate, a
 *  `draft` row hides it. */
export interface MicrocicloPublishState {
  /** athlete_month_assignments.id — the publish target. */
  assignment_id: string;
  /** program_month_templates.name — the agnostic microciclo label. */
  name: string;
  /** Materialized weeks (microcycles) in this microciclo. */
  week_count: number;
  /** Weeks still hidden from the athlete (weekly_plans.status='draft'). */
  draft_week_count: number;
  /** Materialized workout_assignments; 0 ⇒ empty ⇒ not publishable. */
  session_count: number;
  publish_state: 'draft' | 'partial' | 'published';
}

interface AssignmentWeeks {
  name: string;
  /** Monday ISO of each materialized week, ascending. */
  week_starts: string[];
  session_count: number;
}

/**
 * Load the week_starts (from `microcycles`) + materialized session count for ONE
 * assignment, scoped to the athlete (returns null when the assignment doesn't
 * exist or doesn't belong to the athlete — the ownership/foreign guard).
 */
async function loadAssignmentWeeks(
  client: Sql,
  athleteId: number,
  assignmentId: number,
): Promise<AssignmentWeeks | null> {
  const meta = await client<Array<{ name: string }>>`
    select m.name as name
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    where ama.id = ${assignmentId} and ama.athlete_id = ${athleteId}
    limit 1
  `;
  if (!meta[0]) return null;

  // week_starts = the Monday of each materialized microcycle (the materializer
  // Monday-aligns each week), in chronological order — these match the
  // weekly_plans week_start keys exactly.
  const weeks = await client<Array<{ week_start: string }>>`
    select to_char(mc.start_date, 'YYYY-MM-DD') as week_start
    from athlete_month_assignments ama
    join microcycles mc
      on mc.id = any(ama.microcycle_ids) and mc.athlete_id = ama.athlete_id
    where ama.id = ${assignmentId} and ama.athlete_id = ${athleteId}
    order by mc.start_date asc
  `;

  const sessions = await client<Array<{ n: number }>>`
    select count(*)::int as n
    from athlete_month_assignments ama
    join workout_assignments wa
      on wa.microcycle_id = any(ama.microcycle_ids) and wa.athlete_id = ama.athlete_id
    where ama.id = ${assignmentId} and ama.athlete_id = ${athleteId}
  `;

  return {
    name: meta[0].name,
    week_starts: weeks.map((w) => w.week_start),
    session_count: sessions[0]?.n ?? 0,
  };
}

/**
 * Resolve the athlete's current-or-next microciclo and compute its publish state.
 * Target = the assignment whose window hasn't ended yet, soonest start — covers
 * both an ACTIVE microciclo and a just-assigned FUTURE draft. Returns null when
 * the athlete has no upcoming microciclo.
 */
export async function loadMicrocicloPublishState(params: {
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<MicrocicloPublishState | null> {
  const client = params.client ?? defaultSql;
  const athleteId = Number(params.athlete_id);
  const todayIso = isoDateString(startOfDayInBox(new Date()));

  const target = await client<Array<{ assignment_id: string }>>`
    select ama.id::text as assignment_id
    from athlete_month_assignments ama
    where ama.athlete_id = ${athleteId} and ama.end_date >= ${todayIso}::date
    order by ama.start_date asc
    limit 1
  `;
  if (!target[0]) return null;

  const assignmentId = Number(target[0].assignment_id);
  const micro = await loadAssignmentWeeks(client, athleteId, assignmentId);
  if (!micro) return null;

  // Per-week state: a `draft` weekly_plans row hides the week; no row = visible.
  const draftRows =
    micro.week_starts.length === 0
      ? []
      : await client<Array<{ week_start: string }>>`
          select to_char(week_start, 'YYYY-MM-DD') as week_start
          from weekly_plans
          where athlete_id = ${athleteId}
            and status = 'draft'
            and week_start = any(${micro.week_starts}::date[])
        `;

  const weekCount = micro.week_starts.length;
  const draftCount = draftRows.length;
  const publish_state: MicrocicloPublishState['publish_state'] =
    draftCount === 0 ? 'published' : draftCount >= weekCount ? 'draft' : 'partial';

  return {
    assignment_id: target[0].assignment_id,
    name: micro.name,
    week_count: weekCount,
    draft_week_count: draftCount,
    session_count: micro.session_count,
    publish_state,
  };
}

/**
 * Publish an assigned microciclo: flip every weekly_plans week of the assignment
 * to 'published' (reusing `publishBlock`). Coach-gated (must own the athlete),
 * idempotent, and rejects an empty microciclo (the GATE). Throws PublishWeekError
 * with an honest code/message/status on every failure path.
 */
export async function publishMicrociclo(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  month_assignment_id: number | bigint;
  client?: Sql;
}): Promise<PublishBlockResult> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const athleteId = Number(params.athlete_id);
  const assignmentId = Number(params.month_assignment_id);

  // Ownership first — fail fast before touching the assignment.
  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${athleteId} and coach_id = ${coachId} limit 1
  `;
  if (!owned[0]) {
    throw new PublishWeekError('not_found', 'Atleta no encontrado', 404);
  }

  const micro = await loadAssignmentWeeks(client, athleteId, assignmentId);
  if (!micro) {
    throw new PublishWeekError(
      'not_found',
      'Microciclo no encontrado para este atleta',
      404,
    );
  }

  // GATE — an empty microciclo (no materialized weeks/sessions) has nothing to
  // deliver. Reject honestly instead of publishing a hollow plan.
  if (micro.week_starts.length === 0 || micro.session_count === 0) {
    throw new PublishWeekError(
      'empty_microcycle',
      'Este microciclo no tiene sesiones; no hay nada que publicar.',
      422,
    );
  }

  // Reuse the block-publish path verbatim: idempotent upsert of every week to
  // 'published' + ONE `plan_published` notification. Re-publishing never dupes.
  return publishBlock({
    coach_id: coachId,
    athlete_id: athleteId,
    week_starts: micro.week_starts,
    client,
  });
}
