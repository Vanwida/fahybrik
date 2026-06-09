import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { duplicateWeekTemplate, ProgramWeekError } from '@/lib/coach/program-weeks';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return jsonError('invalid_request', 'Invalid id', 400);
  }

  try {
    const newId = await duplicateWeekTemplate({
      coach_id: auth.session.coach_id,
      id: numericId,
    });
    return jsonOk({ id: newId }, 201);
  } catch (err) {
    if (err instanceof ProgramWeekError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
