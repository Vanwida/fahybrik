import 'server-only';

// Coach-side publish gate for a single athlete-week.
//
// The athlete plan endpoint (app/api/athlete/plan/week) hides any week whose
// weekly_plans row has status='draft'. These helpers are the LEGACY coach-side
// writers of that lifecycle, still used by the MCP tools, the intake and the
// per-athlete publish routes:
//
//   - publishWeek() / publishBlock(): upsert weekly_plans(status='published') and
//                     fire the `plan_published` notification.
//   - markWeekDraft(): upsert weekly_plans(status='draft'); `manual` = RETENIDA.
//   - markFutureWeeksDraft(): the AUTO delivery of a just-materialized programme
//                     (each week opens by itself N days before it starts).
//
// The per-week rules and the new coach acts (publish / hold one week, publish a
// week to many, the daily cron) live in `./week-publishing.ts` — one rule for
// every delivery path.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { notifyPlanPublished } from '@/lib/notifications/plan-published';
import { applyDeliveryToWeeks } from './week-publishing';

/** A materialized week spans 7 days; the materializer Monday-aligns each week. */
const DAYS_PER_WEEK = 7;

/**
 * How a DRAFT weekly_plan reaches the athlete (weekly_plans.delivery_mode) — the
 * SINGLE source of truth for the publish-cron discriminator. Read by the daily
 * cron (`runAutoPublish` in ./week-publishing.ts), which releases ONLY
 * `scheduled` drafts.
 *   · scheduled — AUTO delivery: the week opens by itself N days before it
 *                 starts (N = coaches.auto_publish_days_before, mig 0217).
 *   · manual    — HELD: hidden until the coach publishes it by hand (hold button,
 *                 /assign-draft, intake first-microciclo, MCP unpublish_week).
 *                 The cron NEVER touches it.
 */
export const DELIVERY_MODE = {
  scheduled: 'scheduled',
  manual: 'manual',
} as const;
export type DeliveryMode = (typeof DELIVERY_MODE)[keyof typeof DELIVERY_MODE];

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

/** Exportado para que otros escritores de `weekly_plans` (p. ej. `week-focus.ts`)
 *  reutilicen el MISMO guardia de tenancy en vez de repetir el WHERE a mano. */
export async function assertCoachOwnsAthlete(client: Sql, coachId: number, athleteId: number): Promise<void> {
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

  // The cron's notification (same sender, payload shape and copy, naming THIS
  // week from the athlete's today). Best-effort: the publish is already
  // committed; a missed notification is a courtesy loss, not a correctness issue.
  let notified = false;
  try {
    const out = await notifyPlanPublished({ sql: client, athlete_id: athleteId, variant: 'weekly', week_start: weekStart });
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
 * Publish a whole run of microcycles at once: upsert weekly_plans(status='published')
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

  // ONE notification for the whole block, anchored to its first week («a partir
  // de …»: it opens several). Best-effort: the publish is already committed; a
  // missed notification is a courtesy loss.
  const firstWeek = weekStarts[0] as string;
  let notified = false;
  try {
    const out = await notifyPlanPublished({
      sql: client,
      athlete_id: athleteId,
      variant: 'weekly',
      week_start: firstWeek,
      weeks: weekStarts.length,
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
 * Used by the create-in-draft flows so a week is built privately and stays hidden
 * from the athlete plan endpoint until it is published. Does NOT notify — a draft
 * is not athlete-facing.
 *
 * `delivery_mode` decides WHO releases the draft (default `scheduled`):
 *   · scheduled — the daily cron opens it N days before it starts.
 *   · manual    — HELD: the cron NEVER auto-publishes it; the coach publishes it
 *                 by hand (hold / assign-draft / intake first-microciclo).
 */
export async function markWeekDraft(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  week_start: string;
  delivery_mode?: DeliveryMode;
  client?: Sql;
}): Promise<{ athlete_id: string; week_start: string; status: 'draft'; delivery_mode: DeliveryMode }> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const athleteId = Number(params.athlete_id);
  const weekStart = params.week_start;
  const deliveryMode = params.delivery_mode ?? DELIVERY_MODE.scheduled;

  await assertCoachOwnsAthlete(client, coachId, athleteId);

  await client`
    insert into weekly_plans (athlete_id, week_start, status, delivery_mode, updated_at)
    values (${athleteId}, ${weekStart}::date, 'draft', ${deliveryMode}, now())
    on conflict (athlete_id, week_start)
    do update set status = 'draft', delivery_mode = ${deliveryMode}, updated_at = now()
  `;

  return { athlete_id: String(athleteId), week_start: weekStart, status: 'draft', delivery_mode: deliveryMode };
}

export interface MarkFutureWeeksDraftResult {
  athlete_id: string;
  /** First week of the assignment. */
  current_week_start: string;
  /** Weeks left hidden (auto draft, or held before this call). */
  draft_week_starts: string[];
}

/**
 * AUTO DELIVERY of a just-materialized assignment that spans `week_count` weeks
 * from `start_date`: every week follows the one rule of
 * `shared/domain/coach/week-publishing.ts` — a week that is already due (its
 * Monday is N days away or less) is visible now, a later one is an auto draft the
 * daily cron opens N days before it starts, a HELD week stays held and a week the
 * athlete can already see is never hidden again.
 *
 * Replaces the old staggered rule (first week always visible at once, the rest
 * released by a Saturday-only cron): with it a programme assigned three weeks
 * ahead showed its first week immediately. Keeps its name and shape because the
 * MCP, the sequence walk and the personal-plan chain call it.
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
  const coachId = Number(params.coach_id);
  const athleteId = Number(params.athlete_id);
  await assertCoachOwnsAthlete(client, coachId, athleteId);

  const startMonday = mondayOfWeek(parseIsoDate(params.start_date));
  const weeks: string[] = [];
  for (let i = 0; i < params.week_count; i += 1) {
    weeks.push(isoDateString(addDays(startMonday, i * DAYS_PER_WEEK)));
  }
  const outcome = await applyDeliveryToWeeks(client, {
    coach_id: coachId,
    athlete_id: athleteId,
    week_starts: weeks,
    delivery: 'auto',
  });

  return {
    athlete_id: String(athleteId),
    current_week_start: isoDateString(startMonday),
    draft_week_starts: weeks.filter((w) => outcome.after.get(w)?.status === 'draft'),
  };
}
