import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listMethodologyGroups } from '@/lib/dashboard/coach/methodology-groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/methodology-groups — the 10 pedagogical training groups (A8).
// Feeds the catalog filter + template editor selector.
export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const groups = await listMethodologyGroups();
  return jsonOk({ groups });
}
