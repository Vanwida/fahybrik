// GET /api/cron/sync-race-calendar
//
// Vercel Cron entry-point — weekly, Mondays 05:00 UTC (see vercel.json). Runs
// every race-catalog adapter (HYROX / DEKA / ATHX / Deadly Dozen), upserting the
// scraped events into the shared `events` catalog by (series, source_ref). One
// failing source never aborts the others (Promise.allSettled inside
// syncRaceCalendar), rows absent in a run are aged not deleted, and coach-verified
// rows are never touched. Each source's run is journalled in catalog_sync_runs so
// a broken scraper is visible.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). Mirrors
// the other api/cron/* routes' runtime/auth contract.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { syncRaceCalendar } from '@/lib/races/calendar/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Four sequential-ish source fetches + upserts; give it headroom beyond the
// default function timeout (HYROX alone is a ~650 KB page).
export const maxDuration = 300;

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
    const result = await syncRaceCalendar();
    return jsonOk({ ok: true, ...result });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/sync-race-calendar.GET' });
    return jsonError('internal', 'Race-calendar sync crashed', 500);
  }
}
