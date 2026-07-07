// GET /api/coach/citas/pending — upcoming confirmed calls for the dashboard. Auto-accept
// (#2/#4) removed the pending-approval queue; this now returns "próximas llamadas".

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listUpcomingCalls } from '@/lib/citas/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const calls = await listUpcomingCalls();
  return jsonOk({ calls });
}
