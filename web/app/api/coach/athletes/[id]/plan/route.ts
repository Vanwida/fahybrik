import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { buildAthletePlan, AthletePlanError } from '@/lib/dashboard/coach/athlete-plan';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  view: z.enum(['macro', 'month', 'week']).default('month'),
  anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    view: url.searchParams.get('view') ?? 'month',
    anchor: url.searchParams.get('anchor') ?? undefined,
  });
  if (!parsedQuery.success) return jsonError('bad_request', 'Query inválida', 400);

  try {
    const plan = await buildAthletePlan({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      view_mode: parsedQuery.data.view,
      anchor_iso: parsedQuery.data.anchor,
    });
    return jsonOk({ plan });
  } catch (err) {
    if (err instanceof AthletePlanError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
