// GET /api/coach/athletes/[id]/zones/compare?a=YYYY-MM-DD&b=YYYY-MM-DD&weeks=13
//
// DOS PERIODOS ENFRENTADOS — lo que el coach mira en la ficha antes de decidir si
// eso se convierte en un feedback.
//
// Sin parámetros contesta con el ATAJO DE ENTRADA (antes del plan contra con el
// plan, y si todavía no hay plan, el alta o el trimestre): el mando se abre con
// una comparación de verdad delante en vez de con dos calendarios en blanco.
//
// `presets` viaja SIEMPRE, también cuando se piden fechas a mano. Los atajos son
// aritmética sobre hechos del atleta —cuándo entró, cuándo arrancó su plan— y se
// calculan aquí y no en la pantalla para que el chip no ofrezca un periodo y esta
// ruta sirva otro.
//
// El atleta se comprueba CONTRA EL COACH de la sesión: la ficha de un atleta
// ajeno responde 404, no una comparación vacía.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { sql } from '@/lib/db';
import { loadComparePresets, loadZoneComparison } from '@/lib/zones/compare';
import {
  atajoDeEntrada,
  comparacionEnOrden,
  COMPARE_MAX_WEEKS,
  COMPARE_MIN_WEEKS,
} from '@fahybrid/shared/domain/zone-compare';
import { esLunesIso } from '@fahybrid/shared/domain/zone-chart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);
  const athlete_id = Number(parsedId.data.id);

  const owned = await sql<Array<{ id: string }>>`
    select id::text as id from athletes
    where id = ${athlete_id} and coach_id = ${session.coach_id}
    limit 1
  `;
  if (owned.length === 0) return jsonError('not_found', 'Atleta no encontrado', 404);

  const { presets, contexto } = await loadComparePresets(athlete_id, sql);
  const anclas = { alta: contexto.alta, plan: contexto.plan };

  const url = new URL(request.url);
  const a_start = url.searchParams.get('a');
  const b_start = url.searchParams.get('b');
  const rawWeeks = url.searchParams.get('weeks');

  // Sin fechas: el atajo de entrada. Si ninguno se puede montar (un atleta recién
  // dado de alta esta misma semana), viajan los atajos con su motivo y ninguna
  // comparación — que es lo honesto, en vez de enfrentar dos periodos inventados.
  if (a_start == null && b_start == null && rawWeeks == null) {
    const entrada = atajoDeEntrada(presets);
    if (entrada == null) return jsonOk({ presets, comparativa: null });
    const comparativa = await loadZoneComparison({
      athlete_id,
      a_start: entrada.a_start!,
      b_start: entrada.b_start!,
      weeks: entrada.weeks!,
      anclas,
      client: sql,
    });
    return jsonOk({ presets, comparativa });
  }

  if (a_start == null || b_start == null) {
    return jsonError('bad_request', 'Hacen falta los dos periodos (a y b)', 400);
  }
  if (!esLunesIso(a_start) || !esLunesIso(b_start)) {
    return jsonError('bad_request', 'Los dos periodos empiezan en lunes (YYYY-MM-DD)', 400);
  }
  const weeks = rawWeeks != null && /^\d+$/.test(rawWeeks) ? Number(rawWeeks) : 0;
  if (weeks < COMPARE_MIN_WEEKS || weeks > COMPARE_MAX_WEEKS) {
    return jsonError('bad_request', `weeks entre ${COMPARE_MIN_WEEKS} y ${COMPARE_MAX_WEEKS}`, 400);
  }
  // Con solape, las mismas semanas se sumarían en los dos lados: no es una
  // comparación mal dibujada, es un número falso.
  if (!comparacionEnOrden({ a_start, b_start, weeks })) {
    return jsonError(
      'bad_request',
      'Los dos periodos se pisan. El segundo empieza cuando termina el primero.',
      400,
    );
  }

  const comparativa = await loadZoneComparison({
    athlete_id,
    a_start,
    b_start,
    weeks,
    anclas,
    client: sql,
  });
  return jsonOk({ presets, comparativa });
}
