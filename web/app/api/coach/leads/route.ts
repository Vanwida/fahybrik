// GET /api/coach/leads — list web-onboarding leads for the coach dashboard.
// Coach-guarded. Leads are a standalone pipeline (not athletes); single-coach launch
// so no per-coach scoping. See web/lib/dashboard/coach/leads.ts.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listLeadsForCoach } from '@/lib/dashboard/coach/leads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const data = await listLeadsForCoach();
  return jsonOk(data);
}
