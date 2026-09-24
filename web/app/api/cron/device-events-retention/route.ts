// GET /api/cron/device-events-retention
//
// Vercel Cron — diario (vercel.json). Borra el registro técnico de los aparatos
// de más de 30 días de todos los atletas (0273; decisión de Alex 24-09). El
// escritor ya poda lo del atleta que envía; esto alcanza a los que dejaron de
// enviar.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (cerrado si no está).

import { jsonError, jsonOk } from '@/lib/api/responses';
import { pruneDeviceEvents } from '@/lib/devices/device-events';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const match = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() === expected;
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) return jsonError('unauthorized', 'Cron auth required', 401);
  try {
    const deleted = await pruneDeviceEvents();
    return jsonOk({ ok: true, deleted });
  } catch (err) {
    captureRouteError(err, { route: 'api/cron/device-events-retention.GET' });
    return jsonError('internal', 'Device events retention crashed', 500);
  }
}
