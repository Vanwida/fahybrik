// GET /api/coach/editor/library-item?kind=entreno|bloque&id=N — una pieza de la
// biblioteca lista para caer en una celda del programa o en un día del atleta:
// sus partes guardables con uids frescos (copia; la procedencia queda en
// `source_block_id`). Un bloque solo en prosa devuelve 409: insertarlo perdería
// lo que escribió el coach.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { libraryItemForCell } from '@/lib/dashboard/programming/library';
import { libraryKindSchema } from '@/lib/dashboard/programming/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const kind = libraryKindSchema.safeParse(url.searchParams.get('kind'));
  const id = Number(url.searchParams.get('id'));
  if (!kind.success || !Number.isInteger(id) || id <= 0) return jsonError('bad_request', 'Pieza no válida', 400);
  const item = await libraryItemForCell({ coach_id: auth.session.coach_id, kind: kind.data, id });
  if (!item) return jsonError('not_found', 'Esa pieza no está en tu biblioteca.', 404);
  if (item.parts.length === 0) {
    return jsonError('not_typed', 'Esta pieza solo tiene texto. Escríbela en la biblioteca para poder usarla.', 409);
  }
  return jsonOk(item);
}
