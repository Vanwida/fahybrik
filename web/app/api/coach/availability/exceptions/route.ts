// POST /api/coach/availability/exceptions — block a calendar day. Coach-guarded, Zod.

import { availabilityExceptionInput } from '@fahybrid/shared/schema';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { addException } from '@/lib/citas/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }
  const parsed = availabilityExceptionInput.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Fecha no válida', 400, parsed.error.flatten());
  }
  const exception = await addException(parsed.data.fecha, parsed.data.motivo ?? null);
  return jsonOk({ exception }, 201);
}
