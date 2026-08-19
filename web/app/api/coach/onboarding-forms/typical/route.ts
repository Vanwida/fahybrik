import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { OnboardingFormError, plantTypicalOnboarding } from '@/lib/coach/onboarding-forms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  try {
    const form = await plantTypicalOnboarding(session.coach_id);
    return jsonOk({ form }, 201);
  } catch (e) {
    if (e instanceof OnboardingFormError) return jsonError(e.code, e.message, e.status);
    throw e;
  }
}
