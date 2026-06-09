import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { isPabloIaLlmConfigured } from '@/lib/dashboard/coach/ai/llm';
import { SuggestWeekError, suggestWeekPlan } from '@/lib/dashboard/coach/ai/suggest-week';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function GET() {
  return jsonOk({ llm_configured: isPabloIaLlmConfigured() });
}

export async function POST(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  try {
    const suggestion = await suggestWeekPlan({
      coach_id: session.coach_id,
      body,
    });
    return jsonOk({ suggestion });
  } catch (err) {
    if (err instanceof SuggestWeekError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
