// GET /api/cron/nurture
//
// Vercel Cron entry-point — daily (~08:00 UTC, see vercel.json). Emails the reminder /
// nurture sequences to leads that stalled in the funnel (#10). Logic delegated to
// lib/leads/nurture-run.ts (pure, testable, idempotent claim so overlapping runs never
// double-send). Mirrors the other api/cron/* routes' runtime/auth contract exactly.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset).
// `?dryRun=1` returns the SELECTED candidates without claiming, sending or logging — used
// to inspect the queue safely.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { runNurture } from '@/lib/leads/nurture-run';
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

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';

  try {
    const result = await runNurture({ dryRun });
    return jsonOk({ ok: true, ...result });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/nurture.GET' });
    return jsonError('internal', 'Lead nurture crashed', 500);
  }
}
