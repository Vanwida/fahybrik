import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listAthleteCommunications } from '@/lib/athlete/communications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/communications — LA BANDEJA. Lo que el coach le ha publicado
// y sigue vivo, ya ordenado por lo que le reclama: primero lo que bloquea,
// después lo que vence, después lo que no ha abierto. El orden lo pone el
// dominio compartido, así que iOS lo pinta tal cual llega.
export async function GET(request: Request) {
  const session = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer token required', 401);

  const communications = await listAthleteCommunications({ athlete_id: session.athlete_id });
  return jsonOk({
    communications,
    // Lo que sigue reclamando algo, contado por el servidor: el globito de la
    // pestaña no puede depender de que el cliente sepa las reglas.
    pending: communications.filter((c) => c.claims_attention).length,
  });
}
