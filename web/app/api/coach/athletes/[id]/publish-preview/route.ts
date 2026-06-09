import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import {
  PublishPreviewError,
  buildPublishPreview,
} from '@/lib/dashboard/coach/publish-preview';
import { assignMonthInputSchema } from '@fahybrid/shared/schema/assign-month';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Preview de publicación: devuelve QUÉ recibirá el atleta (días/bloques/
// ejercicios estructurados + nº de sesiones que se materializarían) SIN
// persistir nada. El cliente lo muestra antes de confirmar "Publicar".
// Reusa la misma lógica de materialización (hydrateBlockParts + etiquetas de
// slot) para que el preview = la realidad.
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
    const preview = await buildPublishPreview({
      coach_id: session.coach_id,
      athlete_id: Number(parsedId.data.id),
      month_template_id: parsed.data.month_template_id,
      start_date: parsed.data.start_date,
    });
    return jsonOk({ preview });
  } catch (err) {
    if (err instanceof PublishPreviewError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
