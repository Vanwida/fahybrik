// GET /api/cron/renew-group-plans
//
// Vercel Cron, DIARIO (see vercel.json, antes que el de publicar semanas para que
// las semanas nuevas se abran el mismo día). Pone al día el cursor de cada atleta
// con plan de grupo y, en los grupos que repiten o suben de nivel, prepara la
// vuelta siguiente cuando a su plan le quedan N días o menos (N = coaches.
// plan_renewal_days_before, con defecto de dominio). Con «parar» no hace nada.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). La lógica
// vive en lib/coach/plan-renewal-cron.ts (runPlanRenewal).

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { runPlanRenewal } from '@/lib/coach/plan-renewal-cron';
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
    const result = await runPlanRenewal({ client: sql });
    return jsonOk({ ok: true, ...result });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/renew-group-plans.GET' });
    return jsonError('internal', 'Renew group plans crashed', 500);
  }
}
