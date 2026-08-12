// LAS ANALÍTICAS DE CARRERA DE UN ATLETA — el cable que faltaba.
//
// `buildRunningAnalytics` existía y no lo consumía ninguna ruta ni ninguna
// pantalla: cálculo muerto desde el primer día. Esto es la mitad servidor de
// arreglarlo; la otra mitad es la pestaña «Cómo corre» de la ficha.
//
// POR QUÉ VA POR FETCH DEL CLIENTE Y NO EN EL SERVER COMPONENT DE LA FICHA: el
// cálculo recorre todas las sesiones de la ventana y carga el detalle de cada
// asignación, así que pagarlo en cada apertura de la ficha castigaría a las diez
// pestañas que no lo necesitan. Mismo patrón perezoso que `performance`.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { AthleteAnalyticsError } from '@/lib/dashboard/coach/deep-dive-body';
import { buildRunningAnalytics } from '@/lib/coach/running-analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);

  try {
    // La propiedad del atleta la comprueba el cargador (lanza
    // `AthleteAnalyticsError` 404 si el atleta no es de este coach), para que
    // ningún llamador futuro pueda saltársela.
    const analytics = await buildRunningAnalytics({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
    });
    return jsonOk({ analytics });
  } catch (err) {
    if (err instanceof AthleteAnalyticsError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
