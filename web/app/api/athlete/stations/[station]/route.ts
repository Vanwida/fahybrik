import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildStationDetail, resolveStation } from '@/lib/athlete/station-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The {station} path segment is the iOS station LABEL ("Sled push", "Row 1km",
// …). The client percent-encodes it; Next.js URL-decodes the dynamic param
// before it reaches us, so we do NOT decode again (a second decode would corrupt
// any literal '%'). Validate it as a short non-empty string before resolving —
// the resolver does the tolerant label→station_index mapping and rejects
// anything that isn't one of the 8 HYROX work stations.
const stationParam = z.string().trim().min(1).max(80);

// GET /api/athlete/stations/[station]
// The authenticated athlete's deep-dive for ONE HYROX work station, derived from
// their imported HYROX results: last time vs their own best (+ delta, severity,
// percentile from station rank / field size), the time trend across imported
// races, sub-metrics, the methodology groups that train it, and the technique
// video (when seeded). IA recommendation is deferred (null). Honest-empty when
// the athlete has no imported races recording this station. Mirrors the iOS
// StationDetail Codable contract (snake_case).
export async function GET(
  request: Request,
  ctx: { params: Promise<{ station: string }> },
) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const { station: rawStation } = await ctx.params;
  const parsed = stationParam.safeParse(rawStation);
  if (!parsed.success) {
    return jsonError('bad_request', 'Estación inválida', 400, parsed.error.flatten());
  }

  const station = resolveStation(parsed.data);
  if (!station) {
    return jsonError('not_found', 'Estación HYROX desconocida', 404);
  }

  const detail = await buildStationDetail({ athlete_id: auth.athlete_id, station });
  return jsonOk(detail);
}
