// Publish weekly plans cron — pure logic, no auth, no HTTP.
//
// Runs Saturday 23:59 UTC. Publishes every `draft` weekly_plan whose
// week_start is the upcoming Monday, so athletes see next week's plan the
// moment the new week opens. Each affected athlete gets a `plan_published`
// notification (in-app + best-effort push).
//
// "Upcoming Monday" = Monday of (today + 7 days). On a Saturday this is two
// days out; we anchor off mondayOfWeek so the cron is robust if it fires
// slightly late (Sunday) without double-publishing the current week.
//
// The publish UPDATE returns the affected athlete_ids so we can fan out
// notifications without a second query. Notification failures are
// best-effort and never roll back the publish.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, startOfDayUtc } from '@fahybrid/shared/domain/dates';
import { notifyAthlete } from '@/lib/notifications/dispatch';

export interface PublishWeeklyPlansResult {
  week_start: string;
  published: number;
  notified: number;
}

export async function nextMondayIso(now?: Date): Promise<string> {
  const today = startOfDayUtc(now ?? new Date());
  return isoDateString(mondayOfWeek(addDays(today, 7)));
}

export async function runPublishWeeklyPlans(params: {
  client?: Sql;
  now?: Date;
}): Promise<PublishWeeklyPlansResult> {
  const client = params.client ?? defaultSql;
  const weekStart = await nextMondayIso(params.now);

  // Atomically publish + return who was affected. One row per athlete (the
  // unique (athlete_id, week_start) constraint guarantees at most one plan
  // per athlete per week).
  const published = await client<Array<{ athlete_id: string }>>`
    update weekly_plans
       set status = 'published', updated_at = now()
     where status = 'draft'
       and week_start = ${weekStart}::date
    returning athlete_id::text as athlete_id
  `;

  let notified = 0;
  for (const row of published) {
    try {
      const out = await notifyAthlete({
        sql: client,
        athlete_id: BigInt(row.athlete_id),
        type: 'plan_published',
        payload: {
          athlete_id: row.athlete_id,
          week_start: weekStart,
          deep_link: `/plan?week=${weekStart}`,
        },
        push: {
          title: 'Tu plan de la semana esta listo',
          body: 'Pablo ha publicado tu plan para la proxima semana.',
          deeplink: { screen: 'plan', week_start: weekStart },
        },
      });
      if (out) notified += 1;
    } catch {
      // best-effort: publish already committed; the in-app inbox is durable
      // and a missed push is a courtesy, not a correctness issue.
    }
  }

  return { week_start: weekStart, published: published.length, notified };
}
