// POST /api/coach/ai/text-suggest — BORRADORES de texto libre para los campos
// del editor del coach. Devuelve { suggestions: string[], source: 'ai'|'fallback' }:
// el coach elige uno y lo edita, no se le inserta nada solo.
// GET informa de si el modelo está configurado (paridad con las demás rutas coach/ai).

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { isCoachIaLlmConfigured } from '@/lib/dashboard/coach/ai/llm';
import { TextSuggestError, suggestFreeText } from '@/lib/dashboard/coach/text-ai-suggest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  return jsonOk({ llm_configured: isCoachIaLlmConfigured() });
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
    const { suggestions, source } = await suggestFreeText({
      coach_id: session.coach_id,
      body,
    });
    return jsonOk({ suggestions, source });
  } catch (err) {
    if (err instanceof TextSuggestError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
