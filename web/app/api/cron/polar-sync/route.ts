// GET /api/cron/polar-sync
//
// Vercel Cron entry-point — every 15 min (see vercel.json). Polar's v4 API is
// pull-only (no webhooks), so we poll: for every connected Polar athlete, read
// the v4 list endpoints over an incremental window and ingest new training
// sessions, sleep and nightly recharge. Logic lives in lib/cron/polar-sync.ts
// (testable); this route only authorizes and delegates.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset), matching
// the other crons.

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { runPolarSync } from '@/lib/cron/polar-sync';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A fresh connection's backfill walks up to 28 days one request at a time; give
// the function headroom (Vercel caps this to the plan max). If it ever times out
// mid-run, the next 15-min tick resumes where the ingested data left off.
export const maxDuration = 60;

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
    const result = await runPolarSync({ sql });
    return jsonOk({ ok: true, ...result });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/polar-sync.GET' });
    return jsonError('internal', 'Polar sync crashed', 500);
  }
}
