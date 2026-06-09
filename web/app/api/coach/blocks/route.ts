import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listBlocks } from '@/lib/dashboard/coach/blocks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/blocks?group=<id|all> — Pablo's reusable training blocks
// (Biblioteca de Bloques, 0037). `group` is a methodology_group_id (1..10) or
// `all` (default). Feeds the catalog + the IA day/week composer. snake_case.
export async function GET(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const raw = new URL(req.url).searchParams.get('group');
  let groupId: number | null = null;
  if (raw !== null && raw !== 'all' && raw !== '') {
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      return jsonError('invalid_group', 'group debe ser 1..10 o "all"', 400);
    }
    groupId = n;
  }

  const blocks = await listBlocks(groupId);
  return jsonOk({ blocks });
}
