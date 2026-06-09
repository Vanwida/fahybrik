// POST /api/coach/methodology/test-retrieval — debug endpoint.
// Body: { query, top_k?, source_types? }
// Returns the top-k most-similar chunks for the coach's corpus.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { retrieveRelevant, RetrieveError } from '@/lib/rag/retrieve';
import { retrievalRequestSchema } from '@/lib/rag/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be JSON', 400);
  }
  const parsed = retrievalRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request', 400, parsed.error.flatten());
  }

  try {
    const chunks = await retrieveRelevant({
      coach_id: auth.session.coach_id,
      query: parsed.data.query,
      top_k: parsed.data.top_k,
      source_types: parsed.data.source_types,
    });
    return jsonOk({ chunks });
  } catch (err) {
    if (err instanceof RetrieveError) {
      const status =
        err.code === 'llm_unconfigured'
          ? 503
          : err.code === 'invalid_query'
            ? 400
            : 502;
      return jsonError(err.code, err.message, status);
    }
    throw err;
  }
}
