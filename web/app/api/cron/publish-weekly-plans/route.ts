// GET /api/cron/publish-weekly-plans
//
// Vercel Cron entry-point — Saturday 23:59 UTC (see vercel.json). Publishes
// every draft weekly_plan for the upcoming Monday and notifies the affected
// athletes (`plan_published`).
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). Logic
// delegated to lib/cron/publish-weekly-plans.ts (pure, testable).

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { runPublishWeeklyPlans } from '@/lib/cron/publish-weekly-plans';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization');
  if (!header) return false;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() === expected;
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return jsonError('unauthorized', 'Cron auth required', 401);
  }

  try {
    const result = await runPublishWeeklyPlans({ client: sql });
    return jsonOk({
      ok: true,
      week_start: result.week_start,
      published: result.published,
      notified: result.notified,
    });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/publish-weekly-plans.GET' });
    return jsonError('internal', 'Publish weekly plans crashed', 500);
  }
}
