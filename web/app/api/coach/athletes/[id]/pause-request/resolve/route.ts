import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  confirmPauseRequest,
  declinePauseRequest,
  LifecycleError,
} from '@/lib/coach/athlete-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

// confirm → marks the request confirmed AND pauses the athlete (requested_by='athlete').
// decline → resolves the request with no state change. The athlete id in the path scopes
// the coach view; the resolution keys off the globally-unique request_id.
const resolveSchema = z.object({
  request_id: z.union([z.string(), z.number()]),
  decision: z.enum(['confirm', 'decline']),
});

// POST /api/coach/athletes/[id]/pause-request/resolve
export async function POST(req: Request, _ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = resolveSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos de resolución inválidos', 422, parsed.error.flatten());
  }

  let request_id: bigint;
  try {
    request_id = BigInt(parsed.data.request_id);
    if (request_id <= BigInt(0)) throw new Error('non-positive');
  } catch {
    return jsonError('bad_request', 'request_id debe ser un entero positivo', 400);
  }

  const coach_id = BigInt(session.coach_id);

  try {
    const result =
      parsed.data.decision === 'confirm'
        ? await confirmPauseRequest({ request_id, coach_id })
        : await declinePauseRequest({ request_id, coach_id });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof LifecycleError) return jsonError(err.code, err.message, err.status);
    console.error('[POST /api/coach/athletes/[id]/pause-request/resolve]', err);
    return jsonError('resolve_failed', 'No se pudo resolver la solicitud de pausa', 500);
  }
}
