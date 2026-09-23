// POST /api/coach/editor/library-bulk — acciones en bloque sobre la biblioteca:
// archivar / recuperar y poner o quitar etiquetas del coach.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { addLibraryTags, setLibraryArchived } from '@/lib/dashboard/programming/library';
import { libraryBulkSchema } from '@/lib/dashboard/programming/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = libraryBulkSchema.safeParse(body);
  if (!parsed.success) return jsonError('invalid_payload', parsed.error.issues[0]?.message ?? 'Datos no válidos', 400);
  const b = parsed.data;
  const updated =
    b.action === 'tag'
      ? await addLibraryTags({ coach_id: auth.session.coach_id, items: b.items, add: b.add, remove: b.remove })
      : await setLibraryArchived({ coach_id: auth.session.coach_id, items: b.items, archived: b.action === 'archive' });
  return jsonOk({ updated });
}
