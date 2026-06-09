import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadCoachInbox } from '@/lib/dashboard/coach/inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * HOY — unified coach inbox (UX redesign §1). Read-only aggregation of the
 * existing decision/alert/message surfaces into one ordered queue:
 * critical → decisions → alerts → messages. Approvals go through the
 * existing week-adjustment / monthly-block approve endpoints.
 */
export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const inbox = await loadCoachInbox({ coach_id: session.coach_id });
  return jsonOk(inbox);
}
