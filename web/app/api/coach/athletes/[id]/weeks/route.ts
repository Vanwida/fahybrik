// GET /api/coach/athletes/[id]/weeks?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Las semanas de un atleta como las ve el coach: Visible / Oculta, retenida, cuándo
// se abre sola y cuántos entrenos lleva. Por defecto, esta semana y las dos
// siguientes (el calendario de 3 semanas de la ficha). Máx. 53 semanas.

import { z } from 'zod';
import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseRouteId, parseWith } from '@/lib/coach/api-input';
import { boxToday, listAthleteWeeks, WeekPublishingError } from '@/lib/coach/week-publishing';
import { mondaySchema } from '@fahybrid/shared/schema/assign-many';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { loadCoachTimezone } from '@/lib/coach/coach-timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({ from: mondaySchema.optional(), to: mondaySchema.optional() });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).id, 'atleta');
  if (!id.ok) return id.response;

  const url = new URL(req.url);
  const q = parseWith(querySchema, {
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });
  if (!q.ok) return q.response;

  const tz = await loadCoachTimezone(auth.session.coach_id);
  const thisMonday = isoDateString(mondayOfWeek(parseIsoDate(boxToday(new Date(), tz))));
  const from = q.data.from ?? thisMonday;
  const to = q.data.to ?? isoDateString(addDays(parseIsoDate(from), 14));

  try {
    const weeks = await listAthleteWeeks({ coach_id: auth.session.coach_id, athlete_id: id.data, from, to });
    return jsonOk({ weeks });
  } catch (err) {
    if (err instanceof WeekPublishingError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
