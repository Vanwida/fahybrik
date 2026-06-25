import 'server-only';

// Coach-side publish gate for a single athlete-week.
//
// The athlete plan endpoint (app/api/athlete/plan/week) hides any week whose
// weekly_plans row has status='draft'. These helpers are the coach-side writers
// of that lifecycle:
//
//   - publishWeek():  upsert weekly_plans(status='published') for (athlete, week)
//                     and fire the same `plan_published` notification the cron
//                     sends, so the athlete is told their week is live.
//   - markWeekDraft(): upsert weekly_plans(status='draft') — the future
//                     create-in-draft flow uses this so a week is built privately
//                     and stays hidden from the athlete until publishWeek() runs.
//
// Notification dispatch is reused verbatim from lib/cron/publish-weekly-plans.ts
// (same payload + push copy) — single source of truth for what "plan published"
// means to the athlete.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/atr/dates';
import { notifyAthlete } from '@/lib/notifications/dispatch';

/** A materialized week spans 7 days; the materializer Monday-aligns each week. */
const DAYS_PER_WEEK = 7;

export class PublishWeekError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PublishWeekError';
  }
}

export interface PublishWeekResult {
  athlete_id: string;
  week_start: string;
  status: 'published';
  notified: boolean;
}

async function assertCoachOwnsAthlete(client: Sql, coachId: number, athleteId: number): Promise<void> {
  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${athleteId} and coach_id = ${coachId} limit 1
  `;
  if (!owned[0]) {
    throw new PublishWeekError('not_found', 'Atleta no encontrado', 404);
  }
}

/**
 * Publish a single athlete-week: upsert weekly_plans(status='published') for
 * (athlete, week_start) and fire the `plan_published` notification. Idempotent —
 * re-publishing the same week just re-stamps updated_at. `approved_by` records
 * the publishing coach.
 */
export async function publishWeek(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  week_start: string;
  client?: Sql;
}): Promise<PublishWeekResult> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const athleteId = Number(params.athlete_id);
  const weekStart = params.week_start;

  await assertCoachOwnsAthlete(client, coachId, athleteId);

  await client`
    insert into weekly_plans (athlete_id, week_start, status, approved_by, updated_at)
    values (${athleteId}, ${weekStart}::date, 'published', ${coachId}, now())
    on conflict (athlete_id, week_start)
    do update set status = 'published', approved_by = ${coachId}, updated_at = now()
  `;

  // Mirror the cron's notification verbatim (payload shape + push copy). Best-
  // effort: the publish is already committed; a missed notification is a courtesy
  // loss, not a correctness issue.
  let notified = false;
  try {
    const out = await notifyAthlete({
      sql: client,
      athlete_id: BigInt(athleteId),
      type: 'plan_published',
      payload: {
        athlete_id: String(athleteId),
        week_start: weekStart,
        deep_link: `/plan?week=${weekStart}`,
      },
      push: {
        title: 'Tu plan de la semana esta listo',
        body: 'Pablo ha publicado tu plan para la proxima semana.',
        deeplink: { screen: 'plan', week_start: weekStart },
      },
    });
    notified = Boolean(out);
  } catch {
    // best-effort
  }

  return {
    athlete_id: String(athleteId),
    week_start: weekStart,
    status: 'published',
    notified,
  };
}

export interface PublishBlockResult {
  athlete_id: string;
  week_starts: string[];
  status: 'published';
  notified: boolean;
}

/**
 * Publish an entire ATR block at once: upsert weekly_plans(status='published')
 * for EACH week_start of the block, then fire a SINGLE `plan_published`
 * notification (anchored to the block's first week) so the athlete is told once,
 * not N times. This is the publish side of the create-in-draft → review →
 * publish loop: a block created in draft via /assign-draft spans N weeks, and
 * all N must flip to published together or the athlete would see a block with
 * holes. Idempotent — re-publishing re-stamps updated_at. `approved_by` records
 * the publishing coach.
 */
export async function publishBlock(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  week_starts: string[];
  client?: Sql;
}): Promise<PublishBlockResult> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const athleteId = Number(params.athlete_id);
  // Dedupe + sort so the notification anchors on the real first week regardless
  // of input order, and a repeated week_start doesn't double-write.
  const weekStarts = [...new Set(params.week_starts)].sort();

  await assertCoachOwnsAthlete(client, coachId, athleteId);

  if (weekStarts.length === 0) {
    throw new PublishWeekError('bad_request', 'Sin semanas que publicar', 400);
  }

  for (const weekStart of weekStarts) {
    await client`
      insert into weekly_plans (athlete_id, week_start, status, approved_by, updated_at)
      values (${athleteId}, ${weekStart}::date, 'published', ${coachId}, now())
      on conflict (athlete_id, week_start)
      do update set status = 'published', approved_by = ${coachId}, updated_at = now()
    `;
  }

  // ONE notification for the whole block, anchored to its first week (same
  // payload shape + push copy as publishWeek). Best-effort: the publish is
  // already committed; a missed notification is a courtesy loss.
  const firstWeek = weekStarts[0] as string;
  let notified = false;
  try {
    const out = await notifyAthlete({
      sql: client,
      athlete_id: BigInt(athleteId),
      type: 'plan_published',
      payload: {
        athlete_id: String(athleteId),
        week_start: firstWeek,
        deep_link: `/plan?week=${firstWeek}`,
      },
      push: {
        title: 'Tu plan de la semana esta listo',
        body: 'Pablo ha publicado tu plan para la proxima semana.',
        deeplink: { screen: 'plan', week_start: firstWeek },
      },
    });
    notified = Boolean(out);
  } catch {
    // best-effort
  }

  return {
    athlete_id: String(athleteId),
    week_starts: weekStarts,
    status: 'published',
    notified,
  };
}

/**
 * Mark a single athlete-week as draft (upsert weekly_plans(status='draft')).
 * Used by the future create-in-draft flow so a week is built privately and
 * stays hidden from the athlete plan endpoint until publishWeek() runs. Does
 * NOT notify — a draft is not athlete-facing.
 */
export async function markWeekDraft(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  week_start: string;
  client?: Sql;
}): Promise<{ athlete_id: string; week_start: string; status: 'draft' }> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const athleteId = Number(params.athlete_id);
  const weekStart = params.week_start;

  await assertCoachOwnsAthlete(client, coachId, athleteId);

  await client`
    insert into weekly_plans (athlete_id, week_start, status, updated_at)
    values (${athleteId}, ${weekStart}::date, 'draft', now())
    on conflict (athlete_id, week_start)
    do update set status = 'draft', updated_at = now()
  `;

  return { athlete_id: String(athleteId), week_start: weekStart, status: 'draft' };
}

export interface MarkFutureWeeksDraftResult {
  athlete_id: string;
  /** Week left published (delivered now) — the assignment's first week. */
  current_week_start: string;
  /** Future weeks marked draft (hidden until the Saturday cron unlocks each). */
  draft_week_starts: string[];
}

/**
 * STAGGERED WEEKLY DELIVERY — given a just-materialized assignment that spans
 * `weekCount` weeks starting at `startDate`, leave the FIRST week published
 * (delivered to the athlete now) and mark every SUBSEQUENT week as `draft`.
 *
 * The athlete plan endpoint (app/api/athlete/plan/week) hides any week with a
 * `draft` weekly_plans row, so the athlete sees only the current week. The
 * Saturday cron (lib/cron/publish-weekly-plans) flips exactly ONE draft → the
 * upcoming Monday's, unlocking the next week each weekend. Without this, an
 * assignment with no weekly_plans rows reads as all-published and the athlete
 * sees every future week at once.
 *
 * Anchored to the Monday of `startDate` (the materializer Monday-aligns each
 * week), so the draft week_starts match EXACTLY the materialized microcycles.
 * A single week (weekCount <= 1) marks nothing — there's no future week to hide.
 * Idempotent: re-running re-stamps the same draft rows (markWeekDraft upserts).
 */
export async function markFutureWeeksDraft(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  /** First week's start (any day; normalized to its Monday). */
  start_date: string;
  /** Number of weeks the assignment spans (= materialized microcycle count). */
  week_count: number;
  client?: Sql;
}): Promise<MarkFutureWeeksDraftResult> {
  const client = params.client ?? defaultSql;
  const startMonday = mondayOfWeek(parseIsoDate(params.start_date));
  const currentWeekStart = isoDateString(startMonday);

  const draftWeekStarts: string[] = [];
  for (let i = 1; i < params.week_count; i += 1) {
    const weekStart = isoDateString(addDays(startMonday, i * DAYS_PER_WEEK));
    await markWeekDraft({
      coach_id: params.coach_id,
      athlete_id: params.athlete_id,
      week_start: weekStart,
      client,
    });
    draftWeekStarts.push(weekStart);
  }

  return {
    athlete_id: String(Number(params.athlete_id)),
    current_week_start: currentWeekStart,
    draft_week_starts: draftWeekStarts,
  };
}
