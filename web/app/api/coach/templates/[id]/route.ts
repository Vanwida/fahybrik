import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  countTemplateUsageInWeeks,
  deleteTemplate,
  getTemplateDetail,
  TemplateError,
  updateTemplate,
} from '@/lib/dashboard/coach/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const tid = parseId(id);
  if (tid == null) return jsonError('bad_request', 'id inválido', 400);

  const template = await getTemplateDetail({
    coach_id: session.coach_id,
    template_id: tid,
  });
  if (!template) return jsonError('not_found', 'Entreno no encontrado', 404);

  const usage_in_weeks = await countTemplateUsageInWeeks({
    coach_id: session.coach_id,
    template_id: tid,
  });

  return jsonOk({ template, usage_in_weeks });
}

export async function PUT(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const tid = parseId(id);
  if (tid == null) return jsonError('bad_request', 'id inválido', 400);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  try {
    await updateTemplate({
      coach_id: session.coach_id,
      template_id: tid,
      payload,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof TemplateError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo actualizar el entreno';
    return jsonError('internal_error', message, 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const tid = parseId(id);
  if (tid == null) return jsonError('bad_request', 'id inválido', 400);

  try {
    await deleteTemplate({
      coach_id: session.coach_id,
      template_id: tid,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof TemplateError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo borrar el entreno';
    return jsonError('internal_error', message, 500);
  }
}
