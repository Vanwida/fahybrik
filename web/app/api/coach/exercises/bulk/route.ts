// POST /api/coach/exercises/bulk
//
// Da de alta VARIOS ejercicios propios del coach en una sola petición, dentro de
// una transacción: o entran todos o no entra ninguno. Lo pide la revisión del
// importador, donde una semana real deja treinta nombres que el catálogo no
// tiene y hacerlos uno a uno significa que nadie los hace.
//
// La validación de verdad (los tres campos obligatorios, los enums, el tope por
// tanda y el duplicado dentro de la propia tanda) vive en
// `lib/dashboard/exercises/bulk-create.ts`; esta ruta es sesión + despacho, igual
// que el resto de rutas del importador.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { BulkCreateError, createExercisesBulk } from '@/lib/dashboard/exercises/bulk-create';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  try {
    const result = await createExercisesBulk({ coach_id: session.coach_id, body });
    return jsonOk(result, 201);
  } catch (err) {
    if (err instanceof BulkCreateError) {
      return jsonError(err.code, err.message, err.status, err.details);
    }
    // La transacción ya ha hecho rollback: no hay medio catálogo creado. Se dice
    // que no entró NADA para que el coach pueda reintentar sin miedo a duplicar.
    return jsonError(
      'internal_error',
      'No se pudo crear ninguno de los ejercicios. No se ha guardado nada, puedes volver a intentarlo.',
      500,
    );
  }
}
