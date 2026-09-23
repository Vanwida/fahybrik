import 'server-only';

// El estado de visibilidad del programa en curso (o el siguiente) de un atleta,
// SOLO LECTURA: cuántas de sus semanas ve y cuáles siguen ocultas. Lo lee el plan
// del atleta (`athlete-plan.ts`) y, por él, el MCP (`get_plan`: «publicado a
// medias», etc.).
//
// Antes vivía en `publish-microciclo.ts` junto a `publishMicrociclo` (publicar
// el programa entero de golpe). Esa escritura se retiró con el rehacer del panel
// — la visibilidad es por semana y se abre sola N días antes (DECISIONS
// 2026-09-23) — y aquí queda la lectura, que sigue viva.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { weekStates } from '@/lib/mcp/shape-write';
import { athleteSeesItFromWeeklyStatus } from '@fahybrid/shared/domain/coach/athlete-week-chip';

/** One materialized week of the microciclo, for the rail — same visibility gate
 *  as the MCP and the athlete app (`athleteSeesItFromWeeklyStatus`). */
export interface MicrocicloWeekState {
  /** Monday ISO of this week (matches `weekly_plans.week_start`). */
  week_start: string;
  /** True unless this week has an explicit `weekly_plans.status='draft'` row. */
  visible: boolean;
}

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
  /** Per-week visibility, chronological — the rail's source of truth (which
   *  week is Visible vs Borrador, not just the aggregate count). */
  weeks: MicrocicloWeekState[];
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
 * Resolve the microciclo the coach can ACT on and compute its publish state.
 *
 * Target = the SOONEST current-or-future assignment that still has a hidden
 * (draft) week — so the coach can publish the NEXT draft block even when the
 * active block behind it is already fully published. (Picking only the active
 * assignment hid the Publicar button the moment the active block went live,
 * leaving the next draft block unpublishable by hand.)
 *
 * Falls back to the soonest current-or-future assignment when none has a draft
 * week, so the badge still reflects a fully-published plan. Returns null when the
 * athlete has no upcoming microciclo.
 */
export async function loadMicrocicloPublishState(params: {
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<MicrocicloPublishState | null> {
  const client = params.client ?? defaultSql;
  const athleteId = Number(params.athlete_id);
  const todayIso = isoDateString(startOfDayInBox(new Date()));

  // Prefer the soonest current-or-future microciclo that has at least one draft
  // (hidden) week — that's the actionable one for the Publicar button.
  const withDraft = await client<Array<{ assignment_id: string }>>`
    select ama.id::text as assignment_id
    from athlete_month_assignments ama
    where ama.athlete_id = ${athleteId} and ama.end_date >= ${todayIso}::date
      and exists (
        select 1
        from microcycles mc
        join weekly_plans wp
          on wp.athlete_id = ama.athlete_id
         and wp.week_start = mc.start_date
         and wp.status = 'draft'
        where mc.id = any(ama.microcycle_ids) and mc.athlete_id = ama.athlete_id
      )
    order by ama.start_date asc
    limit 1
  `;

  // Fall back to the soonest current-or-future assignment (all-published / no
  // draft rows) so a fully-published plan still surfaces its 'published' badge.
  const target =
    withDraft.length > 0
      ? withDraft
      : await client<Array<{ assignment_id: string }>>`
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

  // Per-week visibility, reusing the same gate as the MCP and the athlete app
  // (`weekStates` + `athleteSeesItFromWeeklyStatus`): a `draft` row hides the
  // week, no row (or `published`/`archived`) leaves it visible.
  const stateByWeek = await weekStates({
    athlete_id: athleteId,
    week_starts: micro.week_starts,
    client,
  });
  const weeks: MicrocicloWeekState[] = micro.week_starts.map((week_start) => ({
    week_start,
    visible: athleteSeesItFromWeeklyStatus(stateByWeek.get(week_start)?.state ?? null),
  }));

  const weekCount = weeks.length;
  const draftCount = weeks.filter((w) => !w.visible).length;
  const publish_state: MicrocicloPublishState['publish_state'] =
    draftCount === 0 ? 'published' : draftCount >= weekCount ? 'draft' : 'partial';

  return {
    assignment_id: target[0].assignment_id,
    name: micro.name,
    week_count: weekCount,
    draft_week_count: draftCount,
    session_count: micro.session_count,
    publish_state,
    weeks,
  };
}
