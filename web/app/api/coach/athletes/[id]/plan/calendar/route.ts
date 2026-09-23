// GET /api/coach/athletes/[id]/plan/calendar?zoom=semana|3sem|plan
//
// El calendario de la ficha (pestaña Plan) en un zoom: semanas con sus entrenos,
// estado Visible / Oculta, minutos escritos y lo debido/hecho. Lo pide el cliente
// al cambiar de zoom y tras cada cambio del plan.

import { z } from 'zod';
import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseRouteId, parseWith } from '@/lib/coach/api-input';
import { loadFichaCalendar } from '@/lib/dashboard/v2/ficha-calendar';
import { CAL_ZOOMS, DEFAULT_CAL_ZOOM } from '@/lib/dashboard/v2/atleta-detalle-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({ zoom: z.enum(CAL_ZOOMS).default(DEFAULT_CAL_ZOOM) });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).id, 'atleta');
  if (!id.ok) return id.response;
  const q = parseWith(querySchema, { zoom: new URL(req.url).searchParams.get('zoom') ?? undefined });
  if (!q.ok) return q.response;

  const calendar = await loadFichaCalendar({ coach_id: auth.session.coach_id, athlete_id: id.data, zoom: q.data.zoom });
  if (!calendar) return jsonError('not_found', 'Atleta no encontrado', 404);
  return jsonOk({ calendar });
}
