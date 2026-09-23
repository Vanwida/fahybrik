// GET /api/coach/pace-zones?unit=per_km|per_500m → { pace_unit, zones, is_standard, standard }
// PUT /api/coach/pace-zones   body: { pace_unit, zones: [6] | null }
//
// Las seis zonas de ritmo del coach para una unidad (`methodology_zones`, mig
// 0061). `null` = volver al modelo estándar.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { getCoachPaceZones, PaceZonesError, saveCoachPaceZones } from '@/lib/coach/methodology-zones';
import { paceZonesPutSchema } from '@fahybrid/shared/domain/methodology/method-editors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const unit = new URL(req.url).searchParams.get('unit') ?? 'per_km';
  if (unit !== 'per_km' && unit !== 'per_500m') return jsonError('bad_request', 'Unidad desconocida.', 400);
  return jsonOk(await getCoachPaceZones(auth.session.coach_id, unit));
}

export async function PUT(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, paceZonesPutSchema);
  if (!body.ok) return body.response;
  try {
    return jsonOk(await saveCoachPaceZones(auth.session.coach_id, body.data.pace_unit, body.data.zones));
  } catch (err) {
    if (err instanceof PaceZonesError) return jsonError('validation_error', err.message, 422);
    throw err;
  }
}
