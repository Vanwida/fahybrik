import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/blocks/matrix
// Returns the Level × Days matrix for the block library.
// Each cell key = "{level_id}_{days_per_week}". Only blocks with BOTH
// min_level_id and days_per_week set appear in the matrix (blocks without
// those fields still appear in the list view; they're just unplaced).
//
// Response shape:
// {
//   levels: Array<{ id: number; name: string; label: string; sort_order: number }>,
//   cells:  Record<string, { block_id: number; block_name: string; needs_review: boolean } | null>
// }

interface LevelRow {
  id: number;
  name: string;
  label: string;
  sort_order: number;
}

interface BlockMatrixRow {
  id: number;
  name: string;
  min_level_id: number;
  days_per_week: number;
  needs_review: boolean;
}

const DAYS_OPTIONS = [3, 4, 5, 6] as const;

export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const coachId = Number(session.coach_id);

  const [levelRows, blockRows] = await Promise.all([
    sql<LevelRow[]>`
      select id::int, name, label, sort_order
      from athlete_levels
      where coach_id = ${coachId}
      order by sort_order asc, id asc
    `,
    sql<BlockMatrixRow[]>`
      select
        b.id::int,
        b.title as name,
        b.min_level_id::int,
        b.days_per_week::int,
        coalesce(b.needs_review, false) as needs_review
      from blocks b
      where b.coach_id = ${coachId}
        and b.min_level_id is not null
        and b.days_per_week is not null
      order by b.min_level_id, b.days_per_week
    `,
  ]);

  // Build cells map: key = "{level_id}_{days}" → first matching block or null.
  // We take the first block per cell (one block per cell is the intended model).
  const cellMap: Record<string, { block_id: number; block_name: string; needs_review: boolean }> =
    {};

  for (const b of blockRows) {
    const key = `${b.min_level_id}_${b.days_per_week}`;
    if (!cellMap[key]) {
      cellMap[key] = {
        block_id: b.id,
        block_name: b.name,
        needs_review: Boolean(b.needs_review),
      };
    }
  }

  // Build the full sparse cells record (only filled cells are present — null
  // cells are implied by absence, but we include them for predictable iteration
  // on the client).
  const cells: Record<
    string,
    { block_id: number; block_name: string; needs_review: boolean } | null
  > = {};

  for (const level of levelRows) {
    for (const days of DAYS_OPTIONS) {
      const key = `${level.id}_${days}`;
      cells[key] = cellMap[key] ?? null;
    }
  }

  return jsonOk({ levels: levelRows, cells });
}
