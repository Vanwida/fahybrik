// GET /api/cron/auto-import-results
//
// Vercel Cron entry-point — daily (see vercel.json). AUTO-RESULT-ON-PASS: for
// every athlete whose target/registered race date has passed without a result,
// and who is linked to a hyresult profile (athletes.hyresult_slug), re-pull
// their hyresult history. The reconcile inside importAllRaces adopts the freshly
// completed result onto the pending objective in place — no duplicate row.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). Logic
// delegated to lib/cron/auto-import-results.ts (pure, testable).

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { runAutoImportResults } from '@/lib/cron/auto-import-results';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail-closed: if no secret is configured, refuse to run.
    return false;
  }
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
    const result = await runAutoImportResults({ client: sql });
    return jsonOk({ ok: true, ...result });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/auto-import-results.GET' });
    return jsonError('internal', 'Auto-import results crashed', 500);
  }
}
