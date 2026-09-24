// GET  /api/coach/levels → { levels, archived, max_microcycle_weeks }
// POST /api/coach/levels   body: { name, label?, description? } → { level_id }
//
// Los niveles del coach (su eje de clasificación, «Nivel» por defecto). `levels`
// son los ACTIVOS en su orden — lo que ofrece un selector —; `archived` los
// retirados (siguen en quien los lleva). El tope de semanas de un programa viaja
// aquí también (card 135), que es lo que ya pide el modal de programa nuevo.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { createCoachLevel, LevelError, listCoachLevels } from '@/lib/coach/levels';
import { loadCoachMaxMicrocicloWeeks } from '@/lib/coach/microcycle-limits';
import { levelCreateSchema } from '@fahybrid/shared/domain/coach/level-editor';
import { levelErrorResponse } from './errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const coach_id = Number(auth.session.coach_id);
  const [all, maxWeeks] = await Promise.all([
    listCoachLevels(coach_id),
    loadCoachMaxMicrocicloWeeks({ coach_id }),
  ]);
  return jsonOk({
    levels: all.filter((l) => l.archived_at == null),
    archived: all.filter((l) => l.archived_at != null),
    max_microcycle_weeks: maxWeeks,
  });
}

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, levelCreateSchema);
  if (!body.ok) return body.response;
  try {
    const level_id = await createCoachLevel(auth.session.coach_id, body.data);
    return jsonOk({ level_id }, 201);
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    throw err;
  }
}
