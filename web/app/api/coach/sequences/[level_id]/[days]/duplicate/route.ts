// POST /api/coach/sequences/[level_id]/[days]/duplicate
//   Copies a WHOLE matrix cell — the SOURCE coordinate (level_id × days) in the
//   path — into a TARGET cell (target_level_id × target_days_per_week in the body).
//   Deep-clones every microciclo of the source (independent weeks/slots_json),
//   retargets the clones to the target level, and writes them as the target cell's
//   ordered items, copying the source's end/progression config. V1: the target
//   cell must be EMPTY or nonexistent (no merge → 409 otherwise).
//
// Coach-scoped: coach_id comes from the session (requireCoach), NEVER the client.
// Source ownership + target validity + the empty-target guard run server-side.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { duplicateSequenceCell, SaveSequenceError } from '@/lib/dashboard/coach/sequences';
import { ProgramMonthError } from '@/lib/dashboard/coach/program-months';
import {
  sequenceDaysPerWeek,
  programSequenceDuplicateSchema,
} from '@fahybrid/shared/schema/program-sequences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ level_id: string; days: string }>;
}

function parsePositiveInt(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { level_id: rawLevel, days: rawDays } = await ctx.params;

  const sourceLevelId = parsePositiveInt(rawLevel);
  if (sourceLevelId === null) return jsonError('bad_request', 'level_id inválido', 400);
  const sourceDays = sequenceDaysPerWeek.safeParse(parsePositiveInt(rawDays));
  if (!sourceDays.success) return jsonError('bad_request', 'days inválido (3-6)', 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be JSON', 400);
  }
  const parsed = programSequenceDuplicateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Destino inválido', 400, parsed.error.flatten());
  }

  try {
    const sequence = await duplicateSequenceCell(
      auth.session.coach_id,
      { level_id: sourceLevelId, days_per_week: sourceDays.data },
      { level_id: parsed.data.target_level_id, days_per_week: parsed.data.target_days_per_week },
    );
    return jsonOk({ sequence }, 201);
  } catch (err) {
    if (err instanceof SaveSequenceError) {
      const status =
        err.code === 'table_absent'
          ? 503
          : err.code === 'target_occupied'
            ? 409
            : err.code === 'source_empty'
              ? 404
              : err.code === 'invalid_level'
                ? 422
                : 500;
      return jsonError(err.code, err.message, status);
    }
    if (err instanceof ProgramMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
