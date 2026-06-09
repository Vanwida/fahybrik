// GET /api/cron/weekly-evaluation
//
// Vercel Cron entry-point — Monday 09:00 UTC (see vercel.json). Evaluates the
// just-finished week for every athlete with an active month assignment and
// creates IA week-adjustment proposals where the verdict is not 'ok'.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). Logic
// delegated to lib/cron/weekly-evaluation.ts (pure, testable).

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { runWeeklyEvaluation } from '@/lib/cron/weekly-evaluation';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Weekly evaluation iterates every active athlete + may call the LLM per
// athlete; give it room beyond the default function budget.
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
    const result = await runWeeklyEvaluation({ client: sql });
    return jsonOk({
      ok: true,
      evaluated: result.evaluated,
      proposals_created: result.proposals_created,
      errors: result.errors,
    });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/weekly-evaluation.GET' });
    return jsonError('internal', 'Weekly evaluation crashed', 500);
  }
}
