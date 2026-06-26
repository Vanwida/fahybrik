import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getBlockById, getBlockLibraryExercises } from '@/lib/dashboard/coach/blocks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/coach/blocks/[id]/library — el bloque + sus ejercicios estructurados
// en el shape de la BIBLIOTECA (conserva `reps_scheme` "10/10/8/8/6" y
// `load_pct_range` "65-80" verbatim, que el shape `WeekDayPartItem` del studio
// descarta). Lo consume el drawer de detalle de la vista Biblioteca. Solo
// lectura. `exercises` es [] cuando el bloque es needs_review (sin desglose).
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const block_id = Number(id);
  if (!Number.isFinite(block_id) || block_id <= 0) {
    return jsonError('bad_request', 'id inválido', 400);
  }

  const block = await getBlockById(session.coach_id, block_id);
  if (!block) return jsonError('not_found', 'Bloque no encontrado', 404);

  const exercises = await getBlockLibraryExercises(block_id);
  return jsonOk({ block, exercises });
}
