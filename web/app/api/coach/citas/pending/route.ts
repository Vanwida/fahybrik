// GET /api/coach/citas/pending — upcoming confirmed calls for the dashboard. Auto-accept
// (#2/#4) removed the pending-approval queue; this now returns "próximas llamadas" —
// only the session coach's (through each cita's lead owner).

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listUpcomingCalls } from '@/lib/citas/store';
import { negocioForbidden } from '@/lib/coach/negocio-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const noNegocio = await negocioForbidden(session.coach_id);
  if (noNegocio) return noNegocio;
  const calls = await listUpcomingCalls(session.coach_id);
  return jsonOk({ calls });
}
