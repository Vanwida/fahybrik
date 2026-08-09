import { answerCommunication } from '@/lib/athlete/communications';
import { answerCommunicationSchema } from '@fahybrid/shared/domain/coach-communications';
import { athleteCommunicationAct, type RouteCtx } from '@/lib/communications/http';
import { CommunicationError } from '@/lib/communications/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/communications/[id]/answer — elegir una opción. Es el acto
// que desbloquea lo que el coach dejó pendiente de esta respuesta.
export async function POST(req: Request, ctx: RouteCtx) {
  return athleteCommunicationAct(
    req,
    ctx,
    '[POST /api/athlete/communications/[id]/answer]',
    ({ athlete_id, communication_id, body }) => {
      const parsed = answerCommunicationSchema.safeParse(body);
      if (!parsed.success) {
        throw new CommunicationError('validation_error', 'Falta la opción elegida', 422);
      }
      return answerCommunication({ athlete_id, communication_id, item_id: parsed.data.item_id });
    },
  );
}
