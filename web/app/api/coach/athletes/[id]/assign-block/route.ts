import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  AssignBlockError,
  assignBlockToAthlete,
  buildAthleteBlocksView,
} from '@/lib/dashboard/coach/assign-block';
import { assignBlockInputSchema } from '@fahybrid/shared/schema/assign-block';
import { notifyAthlete } from '@/lib/notifications/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID atleta inválido', 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = assignBlockInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const result = await assignBlockToAthlete({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      atr_block: parsed.data.atr_block,
      program_week_template_ids: parsed.data.program_week_template_ids?.map(Number),
      start_date: parsed.data.start_date,
      force: parsed.data.force,
    });

    // Notifica al atleta solo si se materializaron sesiones nuevas (no en un
    // re-aprobado idempotente). Best-effort: el assign ya está commiteado.
    if (!result.already_assigned && result.assignment_count > 0) {
      const { sql } = await import('@/lib/db');
      await notifyAthlete({
        sql,
        athlete_id: BigInt(parsedId.data.id),
        type: 'plan_published',
        payload: {
          athlete_id: parsedId.data.id,
          week_start: result.start_date,
          deep_link: `/plan?week=${result.start_date}`,
        },
        push: {
          title: 'Tu plan está listo',
          body: 'Pablo ha publicado tu siguiente bloque de entrenamiento.',
          deeplink: { screen: 'plan', week_start: result.start_date },
        },
      }).catch(() => undefined);
    }

    return jsonOk({ assign_block: result });
  } catch (err) {
    if (err instanceof AssignBlockError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID atleta inválido', 400);

  try {
    const blocks = await buildAthleteBlocksView({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
    });
    return jsonOk({ blocks_view: blocks });
  } catch (err) {
    if (err instanceof AssignBlockError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
