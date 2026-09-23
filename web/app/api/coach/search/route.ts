// GET /api/coach/search?q=… — the ⌘K palette's data (PLAN §4.9): typed groups
// `{ athletes, programs, groups, library }`, at most 5 each, every one scoped to the
// session's coach, accent/case-insensitive, word-order-free, ES + EN exercise names.
// Screens and actions are static on the client. An empty/absent query returns empty
// groups (the palette stays clean), never an error. See lib/coach/search.ts.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { EMPTY_SEARCH, searchCoach, type CoachSearchResults } from '@/lib/coach/search';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
});

export async function GET(req: Request): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get('q') ?? '' });
  if (!parsed.success) return jsonOk<CoachSearchResults>(EMPTY_SEARCH);

  try {
    const results = await searchCoach({ coach_id: session.coach_id, q: parsed.data.q });
    return jsonOk<CoachSearchResults>(results);
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/search.GET' });
    return jsonError('internal', 'No se pudo buscar', 500);
  }
}
