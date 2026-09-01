import { markCommunicationDone } from '@/lib/athlete/communications';
import { athleteCommunicationAct, type RouteCtx } from '@/lib/communications/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/communications/[id]/done — cerrar una tarea, o dar por hecho
// un protocolo entero (lo que marca todos sus pasos). Una pregunta se cierra
// respondiendo, y una nota o un foco no se cierran.
export async function POST(req: Request, ctx: RouteCtx) {
  return athleteCommunicationAct(
    req,
    ctx,
    '[POST /api/athlete/communications/[id]/done]',
    ({ athlete_id, communication_id }) => markCommunicationDone({ athlete_id, communication_id }),
  );
}
