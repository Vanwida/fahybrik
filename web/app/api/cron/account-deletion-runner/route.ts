// GET /api/cron/account-deletion-runner
//
// Vercel Cron entry-point. Vercel calls this on the schedule defined in
// `vercel.json` (daily at 03:00 UTC). The request includes
// `Authorization: Bearer ${CRON_SECRET}` — we reject anything else with 401
// so the runner can't be triggered externally.
//
// Logic delegated to lib/cron/account-deletion-runner.ts (pure, testable).

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { runAccountDeletionRunner } from '@/lib/cron/account-deletion-runner';
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
  const token = match?.[1]?.trim();
  return token === expected;
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return jsonError('unauthorized', 'Cron auth required', 401);
  }

  try {
    const result = await runAccountDeletionRunner({ client: sql });
    return jsonOk({
      ok: true,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      // Errors are not PII (job_id + user_id + message). Surface them in the
      // response so Vercel logs the full picture without us needing a side
      // table.
      errors: result.errors,
    });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/account-deletion-runner.GET' });
    return jsonError('internal', 'Runner crashed', 500);
  }
}
