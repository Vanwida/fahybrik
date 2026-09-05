// POST /api/athlete/wearables/coros/disconnect  (athlete bearer)
// Revokes the MCP token and marks the connection revoked. Historial stays.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { disconnectCoros } from '@/lib/coros/disconnect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) {
    return jsonError('unauthorized', 'Athlete bearer required', 401);
  }
  await disconnectCoros({ athlete_id: session.athlete_id });
  return jsonOk({ ok: true });
}
