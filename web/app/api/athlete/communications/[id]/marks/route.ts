import { setCommunicationItemMark } from '@/lib/athlete/communications';
import { markCommunicationItemSchema } from '@fahybrid/shared/domain/coach-communications';
import { athleteCommunicationAct, type RouteCtx } from '@/lib/communications/http';
import { CommunicationError } from '@/lib/communications/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/communications/[id]/marks — marcar o desmarcar UN paso del
// protocolo. Cuando no queda ninguno sin marcar, el protocolo queda hecho solo.
export async function POST(req: Request, ctx: RouteCtx) {
  return athleteCommunicationAct(
    req,
    ctx,
    '[POST /api/athlete/communications/[id]/marks]',
    ({ athlete_id, communication_id, body }) => {
      const parsed = markCommunicationItemSchema.safeParse(body);
      if (!parsed.success) {
        throw new CommunicationError('validation_error', 'Paso o estado inválidos', 422);
      }
      return setCommunicationItemMark({
        athlete_id,
        communication_id,
        item_id: parsed.data.item_id,
        done: parsed.data.done,
      });
    },
  );
}
