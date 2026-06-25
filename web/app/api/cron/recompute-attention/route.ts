// GET /api/cron/recompute-attention
//
// Vercel Cron entry-point — every 15 minutes (see vercel.json). Sweeps every
// coach: rolls up each athlete's live state and re-persists the firing attention
// signals (auto-clearing resolved ones). HOY then reads the persisted queue with
// ONE indexed query instead of recomputing N+1 per request.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). Mirrors
// api/cron/weekly-evaluation for runtime/auth contract.

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { recomputeCoach } from '@/lib/coach/attention/recompute';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Iterates every coach and rolls up each of their athletes — give it the full
// cron budget beyond the default function timeout.
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
    const coaches = await sql<Array<{ id: string }>>`select id::text from coaches`;

    let coaches_evaluated = 0;
    let total_fired = 0;
    let total_cleared = 0;
    let errors = 0;

    for (const c of coaches) {
      try {
        const result = await recomputeCoach({ coach_id: Number(c.id) });
        coaches_evaluated += 1;
        total_fired += result.fired;
        total_cleared += result.cleared;
      } catch (err) {
        errors += 1;
        captureRouteError(err, {
          route: 'api/cron/recompute-attention.GET',
          meta: { coach_id: c.id },
        });
      }
    }

    return jsonOk({ ok: true, coaches_evaluated, total_fired, total_cleared, errors });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/recompute-attention.GET' });
    return jsonError('internal', 'Attention recompute crashed', 500);
  }
}
