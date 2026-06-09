// GET /api/cron/expire-invitations
//
// Vercel Cron entry-point — daily (see vercel.json). Expires pending partner
// invitations whose expires_at has elapsed.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). Logic
// delegated to lib/cron/expire-invitations.ts (pure, testable).

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { runExpireInvitations } from '@/lib/cron/expire-invitations';
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
    const result = await runExpireInvitations({ client: sql });
    return jsonOk({ ok: true, expired: result.expired });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/expire-invitations.GET' });
    return jsonError('internal', 'Expire invitations crashed', 500);
  }
}
