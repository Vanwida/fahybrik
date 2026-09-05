// GET /api/cron/coros-sync — optional pull for every connected COROS athlete.

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { runCorosSync } from '@/lib/sync/coros-sync';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
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
    const result = await runCorosSync({ sql });
    return jsonOk({ ok: true, ...result });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/coros-sync.GET' });
    return jsonError('internal', 'COROS sync crashed', 500);
  }
}
