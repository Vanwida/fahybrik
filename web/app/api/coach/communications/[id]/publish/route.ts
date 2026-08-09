import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { publishCommunicationSchema } from '@fahybrid/shared/domain/coach-communications';
import { publishCommunication } from '@/lib/coach/communications-publish';
import { communicationErrorResponse, parseId, type RouteCtx } from '@/lib/communications/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/communications/[id]/publish — el acto que lo pone en la
// bandeja de cada atleta y le manda el aviso. Publicar de nuevo a más atletas
// añade destinatarios sin tocar lo que los anteriores ya habían hecho.
export async function POST(req: Request, ctx: RouteCtx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const id = parseId((await ctx.params).id);
  if (!id) return jsonError('bad_request', 'Id de comunicado inválido', 400);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = publishCommunicationSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Destinatarios inválidos', 422, parsed.error.flatten());
  }

  try {
    return jsonOk(
      await publishCommunication({
        coach_id: session.coach_id,
        id,
        athlete_ids: parsed.data.athlete_ids,
      }),
    );
  } catch (err) {
    return communicationErrorResponse(err, '[POST /api/coach/communications/[id]/publish]');
  }
}
