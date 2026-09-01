import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { duplicateOnboardingForm, OnboardingFormError } from '@/lib/coach/onboarding-forms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const { id } = await ctx.params;
  try {
    const form = await duplicateOnboardingForm(session.coach_id, id);
    return jsonOk({ form }, 201);
  } catch (e) {
    if (e instanceof OnboardingFormError) return jsonError(e.code, e.message, e.status);
    throw e;
  }
}
