// GET /api/coach/messages/threads?q=… — la bandeja de Mensajes del coach: todos
// sus hilos con su estado (por responder / hecho / pospuesto / al día), su espera
// y su último mensaje. Con `q`, solo los hilos cuyo atleta o algún mensaje casa
// (sin tildes, por palabras), con el mensaje que casa. La pantalla la relee tras
// cada acción y cuando entra algo en vivo. Ver lib/dashboard/v2/mensajes-data.ts.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { loadMensajesInbox } from '@/lib/dashboard/v2/mensajes-data';
import type { MensajesInbox } from '@/lib/dashboard/v2/mensajes-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({ q: z.string().trim().max(120).optional() });

export async function GET(req: Request): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get('q') ?? undefined });
  if (!parsed.success) return jsonError('bad_request', 'Búsqueda no válida', 400, parsed.error.flatten());

  try {
    const inbox = await loadMensajesInbox({ coach_id: session.coach_id, q: parsed.data.q || null });
    return jsonOk<MensajesInbox>(inbox);
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/messages/threads.GET' });
    return jsonError('internal', 'No se han podido cargar los mensajes', 500);
  }
}
