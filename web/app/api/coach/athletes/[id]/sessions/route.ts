import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { createDaySession, DaySessionError } from '@/lib/dashboard/coach/day-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createBodySchema = z.object({
  iso_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  display_title: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  template_id: z.coerce.number().int().positive().optional(),
});

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

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Payload inválido', 400, parsed.error.flatten());
  }

  try {
    const result = await createDaySession({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      iso_date: parsed.data.iso_date,
      display_title: parsed.data.display_title,
      notes: parsed.data.notes,
      template_id: parsed.data.template_id,
    });
    return jsonOk({ session: result }, 201);
  } catch (err) {
    if (err instanceof DaySessionError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
