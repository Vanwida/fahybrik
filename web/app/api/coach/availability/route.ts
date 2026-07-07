// GET /api/coach/availability — the coach's weekly windows + upcoming blocked dates.
// PUT /api/coach/availability — replace the full weekly availability. Coach-guarded, Zod.

import { availabilitySetInput } from '@fahybrid/shared/schema';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAvailability, setAvailability } from '@/lib/citas/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const data = await getAvailability();
  return jsonOk(data);
}

export async function PUT(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }
  const parsed = availabilitySetInput.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Disponibilidad no válida', 400, parsed.error.flatten());
  }
  await setAvailability(parsed.data.windows);
  const data = await getAvailability();
  return jsonOk(data);
}
