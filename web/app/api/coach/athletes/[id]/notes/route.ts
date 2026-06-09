import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  appendNote,
  AthleteDeepDiveError,
} from '@/lib/coach/athlete-deep-dive';
import {
  AthleteIdParamSchema,
  NoteCreateSchema,
} from '@/lib/coach/deep-dive-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }

  const { id } = await ctx.params;
  const idParsed = AthleteIdParamSchema.safeParse({ id });
  if (!idParsed.success) {
    return jsonError('bad_request', 'invalid athlete id', 400, idParsed.error.flatten());
  }

  // Demo athletes don't have a real row; surface a clear error so the UI can
  // gracefully no-op.
  if (idParsed.data.id.startsWith('demo-')) {
    return jsonError('demo_athlete', 'no se pueden crear notas en atletas demo', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = NoteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'payload inválido', 400, parsed.error.flatten());
  }

  try {
    const note = await appendNote({
      athlete_id: idParsed.data.id,
      coach_id: session.coach_id,
      body: parsed.data.body,
    });
    return jsonOk({ note }, 201);
  } catch (err) {
    if (err instanceof AthleteDeepDiveError) {
      // 'forbidden' (athlete not assigned to this coach) is surfaced as 404
      // so we don't disclose the existence of other coaches' athletes.
      return jsonError('not_found', 'Athlete not found', 404);
    }
    throw err;
  }
}
