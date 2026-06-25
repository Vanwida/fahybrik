// POST /api/coach/ai/suggest-session-title — suggest a short workout TITLE for a
// day's session from its blocks/exercises. Returns { title, source: 'ai'|'fallback' }.
// GET reports whether the LLM is configured (parity with the other coach/ai routes).
// AGNOSTIC: no methodology/ATR coupling; the title is derived from content only.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { isPabloIaLlmConfigured } from '@/lib/dashboard/coach/ai/llm';
import {
  SuggestSessionTitleError,
  suggestSessionTitle,
} from '@/lib/dashboard/coach/ai/suggest-session-title';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    const { title, source } = await suggestSessionTitle({
      coach_id: session.coach_id,
      body,
    });
    return jsonOk({ title, source });
  } catch (err) {
    if (err instanceof SuggestSessionTitleError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
