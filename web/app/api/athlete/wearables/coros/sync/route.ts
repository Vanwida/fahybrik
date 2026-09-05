// POST /api/athlete/wearables/coros/sync  (athlete bearer)
// Pull MCP activities for this athlete («Sincronizar ahora» + pull on app open).

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadCorosConfig, corosGatedResponse } from '@/lib/coros/config';
import { runCorosSync } from '@/lib/sync/coros-sync';
import { listPendingCorosLinks } from '@/lib/sync/coros-link';
import { listWearableConnections } from '@/lib/wearables/status';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) {
    return jsonError('unauthorized', 'Athlete bearer required', 401);
  }

  const cfg = loadCorosConfig();
  if (!cfg.ok) return corosGatedResponse(cfg.missing);

  const result = await runCorosSync({ sql, athleteId: session.athlete_id });
  const [providers, pending_links] = await Promise.all([
    listWearableConnections({ athlete_id: session.athlete_id }),
    listPendingCorosLinks({ sql, athlete_id: session.athlete_id }),
  ]);
  return jsonOk({
    ok: true,
    imported: result.imported,
    asked: result.asked,
    providers,
    pending_links,
  });
}
