import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getBlockById, getBlockExerciseItems, updateBlock } from '@/lib/dashboard/coach/blocks';
import { blockUpdateSchema } from '@fahybrid/shared/schema/blocks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/coach/blocks/[id] — un bloque de biblioteca (Biblioteca de Bloques,
// 0037) + sus ejercicios estructurados (block_exercises, 0038) mapeados al shape
// `WeekDayPartItem` que consume el week-studio. Permite que, al insertar un
// bloque en un día, el panel de edición (Fase 3) muestre y edite los ejercicios
// reales por-atleta en vez de degradar a la nota verbatim. snake_case.
//
// `items` es [] cuando el bloque es needs_review (sin block_exercises): el panel
// degrada a verbatim + añadir a medida, lo cual es correcto.
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const block_id = Number(id);
  if (!Number.isFinite(block_id) || block_id <= 0) {
    return jsonError('bad_request', 'id inválido', 400);
  }

  const block = await getBlockById(block_id);
  if (!block) return jsonError('not_found', 'Bloque no encontrado', 404);

  const items = await getBlockExerciseItems(block_id);
  return jsonOk({ block, items });
}

// PATCH /api/coach/blocks/[id] — edita los campos del bloque en la BIBLIOTECA
// MAESTRA global (title / description / methodology_group_id / atr_block_hint).
// Mutar afecta a TODA materialización futura del bloque (no a los entrenos ya
// asignados). NO edita los `block_exercises` estructurados (paso aparte). Auth
// coach, validación server-side con Zod, SQL tagged templates. snake_case.
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const block_id = Number(id);
  if (!Number.isFinite(block_id) || block_id <= 0) {
    return jsonError('bad_request', 'id inválido', 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = blockUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const updated = await updateBlock(block_id, parsed.data);
  if (!updated) return jsonError('not_found', 'Bloque no encontrado', 404);

  return jsonOk({ block: updated });
}
