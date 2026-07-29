import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildCohort } from '@/lib/coach/cohort';
import { buildBriefing } from '@/lib/coach/briefing';
import { countUnreadForCoach } from '@/lib/chat/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }

  // The unread count is READ, not guessed. Skipping it here is what made the
  // builder's fallback fire on every single request.
  const [cohort, unread_messages] = await Promise.all([
    buildCohort({ coach_id: session.coach_id }),
    countUnreadForCoach({ coach_id: session.coach_id }),
  ]);
  const briefing = buildBriefing({
    coach_first_name: session.full_name,
    cohort,
    unread_messages,
  });
  return jsonOk({ briefing });
}
