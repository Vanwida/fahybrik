import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { isCoachIaLlmConfigured } from '@/lib/dashboard/coach/ai/llm';
import {
  SuggestWeekFromBlocksError,
  suggestWeekFromBlocks,
} from '@/lib/dashboard/coach/ai/suggest-week-from-blocks';

// Coach IA — compose a week from the BLOCKS library (0037) rather than from
// full templates. The IA selects + adapts existing blocks (never generates
// from scratch). Heuristic fallback works with no LLM configured.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

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
    const suggestion = await suggestWeekFromBlocks({
      coach_id: session.coach_id,
      body,
    });
    return jsonOk({ suggestion });
  } catch (err) {
    if (err instanceof SuggestWeekFromBlocksError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
