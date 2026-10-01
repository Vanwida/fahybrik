import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { updateCommunicationSchema } from '@fahybrid/shared/domain/coach-communications';
import {
  deleteCommunication,
  getCommunication,
  listCommunicationsForAthlete,
  updateCommunication,
} from '@/lib/coach/communications';
import { communicationErrorResponse, parseId, type RouteCtx } from '@/lib/communications/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/communications/[id] — el comunicado + quién lo ha hecho.
export async function GET(req: Request, ctx: RouteCtx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const id = parseId((await ctx.params).id);
  if (!id) return jsonError('bad_request', 'Id de comunicado inválido', 400);

  const athleteParam = new URL(req.url).searchParams.get('athlete_id');
  const athleteId = athleteParam === null ? null : parseId(athleteParam);
  if (athleteParam !== null && !athleteId) {
    return jsonError('bad_request', 'Id de atleta inválido', 400);
  }

  try {
    if (athleteId) {
      const [communication] = await listCommunicationsForAthlete({
        coach_id: session.coach_id, athlete_id: Number(athleteId), communication_id: id,
      });
      return communication ? jsonOk(communication) : jsonError('not_found', 'Comunicado no encontrado', 404);
    }
    return jsonOk(await getCommunication({ coach_id: session.coach_id, id }));
  } catch (err) {
    return communicationErrorResponse(err, '[GET /api/coach/communications/[id]]');
  }
}

// PATCH /api/coach/communications/[id] — solo borradores y plantillas, y siempre
// el comunicado entero: un tipo es una forma cerrada, no un saco de campos.
export async function PATCH(req: Request, ctx: RouteCtx) {
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

  const parsed = updateCommunicationSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Comunicado inválido', 422, parsed.error.flatten());
  }

  try {
    return jsonOk(
      await updateCommunication({ coach_id: session.coach_id, id, input: parsed.data }),
    );
  } catch (err) {
    return communicationErrorResponse(err, '[PATCH /api/coach/communications/[id]]');
  }
}

// DELETE /api/coach/communications/[id] — borra el borrador, archiva lo publicado.
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const id = parseId((await ctx.params).id);
  if (!id) return jsonError('bad_request', 'Id de comunicado inválido', 400);

  try {
    return jsonOk(await deleteCommunication({ coach_id: session.coach_id, id }));
  } catch (err) {
    return communicationErrorResponse(err, '[DELETE /api/coach/communications/[id]]');
  }
}
