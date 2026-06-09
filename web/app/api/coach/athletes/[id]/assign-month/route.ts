import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  AssignMonthError,
  assignMonthToAthlete,
} from '@/lib/dashboard/programming/assign-month';
import { assignMonthInputSchema } from '@fahybrid/shared/schema/assign-month';
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
  if (!parsedId.success) {
    return jsonError('bad_request', 'ID atleta inválido', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = assignMonthInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const result = await assignMonthToAthlete({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      month_template_id: parsed.data.month_template_id,
      start_date: parsed.data.start_date,
    });

    // Notifica al atleta que su coach publicó el plan — solo si se materializó
    // al menos una sesión (publicar un microciclo vacío no entrega nada que
    // ver). Best-effort: el assign ya está commiteado; un push fallido no
    // revierte la publicación (mismo patrón que el cron de publicación semanal).
    if (result.assignment_count > 0) {
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
          title: 'Tu plan esta listo',
          body: 'Pablo ha publicado tu plan de entrenamiento.',
          deeplink: { screen: 'plan', week_start: result.start_date },
        },
      }).catch(() => undefined);
    }

    return jsonOk({ assign_month: result });
  } catch (err) {
    if (err instanceof AssignMonthError) {
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
  if (!parsedId.success) {
    return jsonError('bad_request', 'ID atleta inválido', 400);
  }

  const { sql } = await import('@/lib/db');
  const rows = await sql<
    Array<{
      id: string;
      month_template_id: string;
      month_name: string;
      level: string;
      start_date: string;
      end_date: string;
      assignment_count: number;
    }>
  >`
    select
      ama.id::text,
      ama.month_template_id::text,
      m.name as month_name,
      m.level::text,
      to_char(ama.start_date, 'YYYY-MM-DD') as start_date,
      to_char(ama.end_date, 'YYYY-MM-DD') as end_date,
      ama.assignment_count
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    join athletes a on a.id = ama.athlete_id
    where ama.athlete_id = ${Number(parsedId.data.id)}
      and a.coach_id = ${session.coach_id}
    order by ama.start_date desc
    limit 24
  `;

  return jsonOk({ assignments: rows });
}
