// GET /api/cron/lifecycle
//
// Vercel Cron entry-point — daily at 05:30 UTC (see vercel.json), before the athlete's
// morning. Applies the two lifecycle transitions that fall due on a date: pauses whose
// planned return has elapsed, and bajas the athlete scheduled for the end of their paid
// period. Both sweeps are idempotent — see lib/cron/lifecycle-runner.ts.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). Mirrors the
// other api/cron/* routes' runtime/auth contract.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { runDueLifecycleTransitions } from '@/lib/cron/lifecycle-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization');
  if (!header) return false;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() === expected;
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) return jsonError('unauthorized', 'Cron secret required', 401);
  try {
    const report = await runDueLifecycleTransitions();
    return jsonOk(report);
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/lifecycle.GET' });
    return jsonError('lifecycle_run_failed', 'No se pudieron aplicar las transiciones', 500);
  }
}
