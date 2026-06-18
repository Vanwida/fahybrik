// GET /api/coach/search?q=… — coach-scoped athlete typeahead for the ⌘K
// CommandPalette (SPEC §9 FIX 8: "⌘K typeahead — no cargar roster entero").
// Returns at most 8 athletes whose name matches the query, scoped to the calling
// coach. Empty / too-short query → empty list (the palette degrades gracefully).

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Max results returned to the palette (SPEC §9 "LIMIT 8"). */
const SEARCH_LIMIT = 8;
/** Below this length we don't query — the palette only searches at ≥2 chars. */
const MIN_QUERY_LENGTH = 1;

const querySchema = z.object({
  q: z.string().trim().min(MIN_QUERY_LENGTH).max(120),
});

export interface CoachSearchResult {
  id: string;
  full_name: string;
}

export async function GET(req: Request): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get('q') ?? '' });
  if (!parsed.success) {
    // Too short / absent → no results, not an error (palette stays clean).
    return jsonOk<{ results: CoachSearchResult[] }>({ results: [] });
  }

  // Case-insensitive contains match; `%` and `_` are escaped so a literal query
  // can't act as a wildcard. `ESCAPE '\'` makes the escape char explicit.
  const escaped = parsed.data.q.replace(/[\\%_]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;

  try {
    const rows = await sql<CoachSearchResult[]>`
      select id::text as id, full_name
      from athletes
      where coach_id = ${session.coach_id}
        and full_name ilike ${pattern} escape '\'
      order by full_name asc
      limit ${SEARCH_LIMIT}
    `;
    return jsonOk<{ results: CoachSearchResult[] }>({ results: rows });
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/search.GET' });
    return jsonError('internal', 'No se pudo buscar', 500);
  }
}
