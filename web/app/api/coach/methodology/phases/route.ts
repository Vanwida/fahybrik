// GET  /api/coach/methodology/phases — the session coach's periodization phases,
//                                      ordered by sequence_order.
// PUT  /api/coach/methodology/phases — atomic full-set upsert of the coach's
//                                      ordered phases (insert/update/delete).
//
// Coach-scoped: identity + coach_id come from the session (requireCoach), NEVER
// from the client. The whole payload is validated with the shared Zod schema
// before any DB work; the upsert runs in a single transaction (saveCoachPhases).

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import {
  clearCoachPhases,
  loadCoachPhases,
  saveCoachPhases,
  SavePhasesError,
} from '@/lib/dashboard/coach/phases';
import { methodologyPhasesSaveSchema } from '@fahybrid/shared/schema/methodology-phases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const phases = await loadCoachPhases(auth.session.coach_id);
  return jsonOk({ phases });
}

export async function PUT(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be JSON', 400);
  }

  const parsed = methodologyPhasesSaveSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Set de fases inválido', 400, parsed.error.flatten());
  }

  try {
    const phases = await saveCoachPhases(auth.session.coach_id, parsed.data.phases);
    return jsonOk({ phases });
  } catch (err) {
    if (err instanceof SavePhasesError) {
      const status = err.code === 'table_absent' ? 503 : err.code === 'empty_set' ? 422 : 500;
      return jsonError(err.code, err.message, status);
    }
    throw err;
  }
}

// DELETE — clear ALL of the coach's phases (the "no uso fases" opt-out). PUT
// rejects an empty set by design, so removing the last phase is its own explicit
// operation. Coach-scoped via the session. Idempotent (204 even when none exist).
export async function DELETE() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  await clearCoachPhases(auth.session.coach_id);
  return new Response(null, { status: 204 });
}
