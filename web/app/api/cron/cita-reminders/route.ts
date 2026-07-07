// GET /api/cron/cita-reminders
//
// Vercel Cron entry-point — hourly (see vercel.json). Emails the lead ~24h before an
// ACCEPTED ('aceptada') videollamada. Logic delegated to lib/citas/reminder.ts (pure,
// testable, idempotent claim so overlapping runs never double-send).
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). Mirrors the other
// api/cron/* routes' runtime/auth contract exactly.

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sendDueCitaReminders } from '@/lib/citas/reminder';
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
    const result = await sendDueCitaReminders({ client: sql });
    return jsonOk({
      ok: true,
      candidates: result.candidates,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
    });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/cita-reminders.GET' });
    return jsonError('internal', 'Cita reminders crashed', 500);
  }
}
