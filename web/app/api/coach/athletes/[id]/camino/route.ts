import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/coach/deep-dive-types';
import { resolvePlanPath } from '@/lib/plan/camino';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/athletes/[id]/camino — la espina del plan de ESE atleta.
//
// Existe para que la previa del compositor enseñe el camino DE VERDAD mientras el
// coach escribe la nota, y no un dibujo de ejemplo. Una previa que enseña algo
// distinto de lo que va a recibir el atleta no es un control de calidad: es una
// segunda pantalla que hay que verificar aparte.
//
// `camino: null` cuando ese atleta no tiene nada asignado. Es una respuesta, no
// un error: un atleta sin plan es un caso normal, y la previa lo dice.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'Id de atleta inválido', 400);

  const { sql } = await import('@/lib/db');
  const athleteId = Number(parsedId.data.id);
  // Un atleta que no es suyo responde 404 y no 403: un 403 confirmaría que ese
  // id es de alguien. Es la misma regla que el resto de la entidad.
  const owned = await sql<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${athleteId} and coach_id = ${Number(session.coach_id)} limit 1
  `;
  if (!owned[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  return jsonOk({ camino: await resolvePlanPath({ athlete_id: athleteId }) });
}
