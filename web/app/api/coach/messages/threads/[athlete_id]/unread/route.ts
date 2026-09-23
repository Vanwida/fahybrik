// POST /api/coach/messages/threads/[athlete_id]/unread — «Marcar sin leer»: el
// hilo de ese atleta vuelve a contar como sin abrir para el coach. Solo el
// contador del coach; los acuses de lectura que ya vio el atleta no se tocan.
// Con dueño: un atleta ajeno (o sin hilo) es 404.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { markThreadUnreadForCoach } from '@/lib/chat/service';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ athlete_id: z.string().regex(/^\d{1,18}$/) });

export async function POST(_req: Request, ctx: { params: Promise<{ athlete_id: string }> }): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) return jsonError('bad_request', 'Atleta no válido', 400);

  try {
    const ok = await markThreadUnreadForCoach({ coach_id: session.coach_id, athlete_id: parsed.data.athlete_id });
    if (!ok) return jsonError('not_found', 'Esta conversación ya no está en tu lista', 404);
    return jsonOk({ ok: true });
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/messages/threads/[athlete_id]/unread.POST' });
    return jsonError('internal', 'No se ha podido marcar sin leer', 500);
  }
}
