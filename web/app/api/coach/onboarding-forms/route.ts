import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  createOnboardingForm,
  listOnboardingForms,
  OnboardingFormError,
} from '@/lib/coach/onboarding-forms';
import { emptyDefinition } from '@fahybrid/shared/domain/coach/onboarding-form';
import { onboardingFormWriteSchema } from '@fahybrid/shared/schema/coach-onboarding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const forms = await listOnboardingForms(session.coach_id);
  return jsonOk({ forms });
}

export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = onboardingFormWriteSchema.safeParse({
    ...(typeof body === 'object' && body ? body : {}),
    definition:
      typeof body === 'object' && body && 'definition' in body
        ? (body as { definition: unknown }).definition
        : emptyDefinition(),
  });
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  try {
    const form = await createOnboardingForm(session.coach_id, parsed.data);
    return jsonOk({ form }, 201);
  } catch (e) {
    if (e instanceof OnboardingFormError) return jsonError(e.code, e.message, e.status);
    throw e;
  }
}
