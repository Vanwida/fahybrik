import { markCommunicationSeen } from '@/lib/athlete/communications';
import { athleteCommunicationAct, type RouteCtx } from '@/lib/communications/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/communications/[id]/seen — abrirlo. No cierra nada: un push
// abierto no es una tarea hecha.
export async function POST(req: Request, ctx: RouteCtx) {
  return athleteCommunicationAct(
    req,
    ctx,
    '[POST /api/athlete/communications/[id]/seen]',
    ({ athlete_id, communication_id }) => markCommunicationSeen({ athlete_id, communication_id }),
  );
}
