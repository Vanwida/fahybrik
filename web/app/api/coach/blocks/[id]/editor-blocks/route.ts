import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadBlockEditorModel } from '@/lib/dashboard/v2/editor-data';
import {
  isInsertableBlockModel,
  libraryBlockToEditorBlocks,
} from '@/lib/dashboard/v2/library-block-to-editor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/coach/blocks/[id]/editor-blocks — un bloque de la Biblioteca listo para
// INSERTAR en un día: los `EditorBlock[]` que el editor añade a una sesión, con
// uids frescos, títulos derivados y `source_block_id` puesto. Lo consume el
// LibraryBlockRail del editor de día. Solo lectura. snake_case.
//
// Un bloque NO es siempre una pieza: `blocks` trae una por `block_position` (el
// bloque 52 "10' row z2" son cuatro: row + ski + bike + run). `part_count` = cuántas.
//
// Se pide al ABRIR el bloque, no al listar el rail: cada respuesta trae uids
// nuevos, que es justo lo que permite insertar el mismo bloque dos veces en un día
// sin que colisionen.
//
// 409 cuando el bloque NO está tipado (solo prosa en `description`): insertarlo
// perdería en silencio lo que escribió el coach. El rail ya lo enseña
// deshabilitado; esto es la misma regla en el servidor, que es donde manda.
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const block_id = Number(id);
  if (!Number.isFinite(block_id) || block_id <= 0) {
    return jsonError('bad_request', 'id inválido', 400);
  }

  // getBlockById (dentro del loader) filtra por coach: un bloque de otro coach es
  // indistinguible de uno que no existe.
  const model = await loadBlockEditorModel({ coach_id: session.coach_id, block_id });
  if (!model) return jsonError('not_found', 'Bloque no encontrado', 404);

  if (!isInsertableBlockModel(model)) {
    return jsonError(
      'block_not_typed',
      'Este bloque solo tiene la nota del coach, sin ejercicios sueltos. Típalo en la Biblioteca para poder insertarlo.',
      409,
    );
  }

  const blocks = libraryBlockToEditorBlocks(model);
  return jsonOk({
    block_id: model.block_id,
    title: model.title,
    methodology_group_id: model.methodology_group_id,
    part_count: blocks.length,
    blocks,
  });
}
