import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadLibraryBlockRail } from '@/lib/dashboard/v2/editor-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/editor/library-blocks — la biblioteca de bloques del coach para el
// rail del editor de día: título, `source_ref`, grupo, color de modalidad y el
// estado ESTRUCTURAL (`typed`, `part_count`) que decide si la fila se puede
// insertar. Una consulta (listBlocksWithStructure). Solo lectura. snake_case.
//
// Se pide al ABRIR el rail, no al renderizar el día: el coach abre el editor
// muchas más veces de las que inserta un bloque, y así la lista llega fresca
// después de tocar la Biblioteca en otra pestaña.
//
// Distinto de GET /api/coach/blocks (la Biblioteca): aquí las filas vienen en el
// shape del rail (`LibraryBlockRow`, con `modality_slug` ya derivado), no en el del
// modelo de dominio.
export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const blocks = await loadLibraryBlockRail({ coach_id: session.coach_id });
  return jsonOk({ blocks });
}
