import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { reorderCoachTests } from '@/lib/coach/write-coach-test';
import { listCoachTests } from '@/lib/coach/coach-tests';
import { coachTestReorderSchema } from '@fahybrid/shared/schema/coach-tests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/tests/reorder — persist the display order of the battery.
// Body = { ordered_ids: [] } (the full ordered list; sort_order = index). Returns
// { tests } in the new order.
export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = coachTestReorderSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  await reorderCoachTests(session.coach_id, parsed.data.ordered_ids);
  const tests = await listCoachTests(session.coach_id, {});
  return jsonOk({ tests });
}
