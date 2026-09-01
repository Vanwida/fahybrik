import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  deleteOnboardingForm,
  getOnboardingForm,
  OnboardingFormError,
  updateOnboardingForm,
} from '@/lib/coach/onboarding-forms';
import { onboardingFormUpdateSchema } from '@fahybrid/shared/schema/coach-onboarding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const { id } = await ctx.params;
  const form = await getOnboardingForm(session.coach_id, id);
  if (!form) return jsonError('not_found', 'Ese cuestionario no existe.', 404);
  return jsonOk({ form });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = onboardingFormUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  try {
    const form = await updateOnboardingForm(session.coach_id, id, parsed.data);
    return jsonOk({ form });
  } catch (e) {
    if (e instanceof OnboardingFormError) return jsonError(e.code, e.message, e.status);
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const { id } = await ctx.params;
  try {
    await deleteOnboardingForm(session.coach_id, id);
    return jsonOk({ ok: true });
  } catch (e) {
    if (e instanceof OnboardingFormError) return jsonError(e.code, e.message, e.status);
    throw e;
  }
}
