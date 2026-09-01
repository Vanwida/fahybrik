// GET /api/coach/athletes/[id]/zones/window?week_start=YYYY-MM-DD&weeks=26&modality=run
//
// El tiempo en zonas de un PERIODO CONGELADO — exactamente lo que va a ver el
// atleta dentro de una nota firmada. Lo pide la previa del compositor: si ahí se
// dibujara con la ventana rodante de la ficha, el coach aprobaría una gráfica
// distinta de la que se publica.
//
// Aparte de `zones/weekly` a propósito: aquella responde «los últimos N meses»
// (con la banda del plan y el recuento de semanas sin dato, que es lo que la
// ficha necesita) y ésta responde «este trozo de calendario», que es la forma
// del embed. Son dos preguntas distintas sobre la misma agregación.
//
// El atleta se comprueba CONTRA EL COACH de la sesión: la gráfica de un atleta
// ajeno responde 404, no una gráfica vacía.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { sql } from '@/lib/db';
import { loadZoneWindow, ZONE_MODALITIES } from '@/lib/zones/weekly';
import {
  esLunesIso,
  GRAFICA_MAX_WEEKS,
  GRAFICA_MIN_WEEKS,
  type ZoneChartDTO,
} from '@fahybrid/shared/domain/zone-chart';
import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';

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

  const url = new URL(request.url);
  const week_start = url.searchParams.get('week_start') ?? '';
  if (!esLunesIso(week_start)) {
    return jsonError('bad_request', 'week_start tiene que ser un lunes (YYYY-MM-DD)', 400);
  }

  const rawWeeks = url.searchParams.get('weeks');
  const weeks = rawWeeks != null && /^\d+$/.test(rawWeeks) ? Number(rawWeeks) : 0;
  if (weeks < GRAFICA_MIN_WEEKS || weeks > GRAFICA_MAX_WEEKS) {
    return jsonError('bad_request', `weeks entre ${GRAFICA_MIN_WEEKS} y ${GRAFICA_MAX_WEEKS}`, 400);
  }

  const rawModality = url.searchParams.get('modality');
  // Una modalidad que no existe es una petición mal hecha, no «todas»: servir
  // todo el volumen bajo la etiqueta «Correr» sería mentir en silencio.
  if (rawModality != null && !ZONE_MODALITIES.includes(rawModality as SegmentModality)) {
    return jsonError('bad_request', 'modality inválida', 400);
  }
  const modality = (rawModality as SegmentModality | null) ?? null;

  const { weeks_data, anchor } = await loadZoneWindow({
    athlete_id,
    week_start,
    weeks,
    modality,
  });

  // Sin `ranges`: las marcas son de la NOTA que se está escribiendo, no del
  // atleta. Las pone el compositor encima de lo que devuelve esto.
  const chart: ZoneChartDTO = { week_start, weeks, modality, weeks_data, anchor, ranges: [] };
  return jsonOk({ chart });
}
