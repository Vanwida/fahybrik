// POST /api/coach/athletes/[id]/weeks/[week_start]/hold   body: { held?: boolean }
//
// Retener una semana: queda oculta al atleta y el cron no la abre sola. `held:
// false` la suelta (vuelve a lo automático; si ya tocaba verla, se publica en el
// acto). Sin cuerpo, alterna — pero la pantalla debería mandar `held` explícito
// para que un doble clic no deshaga lo que acaba de hacer.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody, parseRouteId, parseWith } from '@/lib/coach/api-input';
import { setAthleteWeekHeld, WeekPublishingError } from '@/lib/coach/week-publishing';
import { mondaySchema } from '@fahybrid/shared/schema/assign-many';
import { weekHoldInputSchema } from '@fahybrid/shared/schema/week-publishing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string; week_start: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const params = await ctx.params;
  const id = parseRouteId(params.id, 'atleta');
  if (!id.ok) return id.response;
  const week = parseWith(mondaySchema, params.week_start);
  if (!week.ok) return week.response;
  const body = await parseBody(req, weekHoldInputSchema);
  if (!body.ok) return body.response;

  try {
    const result = await setAthleteWeekHeld({
      coach_id: auth.session.coach_id,
      athlete_id: id.data,
      week_start: week.data,
      held: body.data.held,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof WeekPublishingError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
