// GET /api/coach/sequences/[level_id]/[days]
//   One matrix cell (the session coach × athlete_level × days_per_week) with its
//   ordered microciclos. Returns 404 when the cell has no sequence defined yet.
//
// The cell is identified by (level_id, days_per_week) — NOT a single id — because
// that is the matrix coordinate the editor opens. Writes go through PUT
// /api/coach/sequences (atomic full-set save). Coach-scoped via the session.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { getCoachSequenceCell } from '@/lib/dashboard/coach/sequences';
import { sequenceDaysPerWeek } from '@fahybrid/shared/schema/program-sequences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ level_id: string; days: string }>;
}

function parsePositiveInt(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { level_id: rawLevel, days: rawDays } = await ctx.params;

  const levelId = parsePositiveInt(rawLevel);
  if (levelId === null) return jsonError('bad_request', 'level_id inválido', 400);

  const daysParsed = sequenceDaysPerWeek.safeParse(parsePositiveInt(rawDays));
  if (!daysParsed.success) {
    return jsonError('bad_request', 'days inválido (3-6)', 400);
  }

  const sequence = await getCoachSequenceCell(
    auth.session.coach_id,
    levelId,
    daysParsed.data,
  );
  if (!sequence) return jsonError('not_found', 'Secuencia no encontrada', 404);

  return jsonOk({ sequence });
}
