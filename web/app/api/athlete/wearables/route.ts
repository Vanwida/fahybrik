// GET /api/athlete/wearables  (athlete bearer)
//
// The athlete's wearable connection status — drives the iOS devices screen
// ("Conectar Polar" vs "Conectado desde …"). Provider-generic shape: one entry
// per connected/known provider for THIS athlete (from the bearer). No rows → [].
//
//   200 { "providers": [ { "provider": "polar", "connected": true,
//                          "connected_at": "<iso>" } ] }
//   401 unauthorized — no / invalid athlete bearer

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listWearableConnections } from '@/lib/wearables/status';
import { listPendingCorosLinks } from '@/lib/sync/coros-link';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) {
    return jsonError('unauthorized', 'Athlete bearer required', 401);
  }

  const [providers, pending_links] = await Promise.all([
    listWearableConnections({ athlete_id: session.athlete_id }),
    listPendingCorosLinks({ sql, athlete_id: session.athlete_id }),
  ]);
  return jsonOk({ providers, pending_links });
}
