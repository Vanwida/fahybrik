// GET /api/cron/publish-weekly-plans
//
// Vercel Cron, DIARIO (see vercel.json). Abre cada semana en borrador AUTOMÁTICO
// cuyo lunes está a N días o menos (N = coaches.auto_publish_days_before, con
// defecto de dominio) y avisa a cada atleta una vez. Una semana retenida no se
// toca. Sustituye al cron del sábado que solo soltaba «el lunes que viene».
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). La lógica
// vive en lib/coach/week-publishing-cron.ts (runAutoPublish).

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { runAutoPublish } from '@/lib/coach/week-publishing-cron';
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
    const result = await runAutoPublish({ client: sql });
    return jsonOk({ ok: true, today: result.today, published: result.published, notified: result.notified });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/publish-weekly-plans.GET' });
    return jsonError('internal', 'Publish weekly plans crashed', 500);
  }
}
