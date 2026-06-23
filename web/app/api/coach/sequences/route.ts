// GET /api/coach/sequences
//   The whole periodization matrix: every sequence (+ ordered items) of the
//   session coach, keyed for the UI by level_id × days_per_week.
//
// PUT /api/coach/sequences
//   Atomic full-set upsert of ONE matrix cell (level_id × days_per_week): its
//   end_policy, per-loop progression, and ordered microciclos. Modelled on the
//   phases atomic-save (whole ordered set diffed in ONE transaction).
//
// Coach-scoped: identity + coach_id come from the session (requireCoach), NEVER
// from the client. Payload validated with the shared Zod schema before DB work.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import {
  listCoachSequences,
  saveCoachSequence,
  SaveSequenceError,
} from '@/lib/dashboard/coach/sequences';
import { programSequenceSaveSchema } from '@fahybrid/shared/schema/program-sequences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const sequences = await listCoachSequences(auth.session.coach_id);
  return jsonOk({ sequences });
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

  const parsed = programSequenceSaveSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Secuencia inválida', 400, parsed.error.flatten());
  }

  try {
    const sequence = await saveCoachSequence(auth.session.coach_id, parsed.data);
    return jsonOk({ sequence });
  } catch (err) {
    if (err instanceof SaveSequenceError) {
      const status =
        err.code === 'table_absent'
          ? 503
          : err.code === 'invalid_level' ||
              err.code === 'invalid_month_template' ||
              err.code === 'invalid_phase'
            ? 422
            : 500;
      return jsonError(err.code, err.message, status);
    }
    throw err;
  }
}
