import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { duplicateMonthTemplate, ProgramMonthError } from '@/lib/coach/program-months';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  try {
    const newId = await duplicateMonthTemplate({
      coach_id: auth.session.coach_id,
      id: BigInt(id),
    });
    return jsonOk({ id: newId }, 201);
  } catch (err) {
    if (err instanceof ProgramMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
