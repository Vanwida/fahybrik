import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCurrentReview } from '@/lib/coach/weekly-review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }
  const result = await getCurrentReview({ coach_id: session.coach_id });
  return jsonOk({
    review: serialize(result.review),
    attention: result.attention,
    transitions: result.transitions,
    mass_adjustments: result.mass_adjustments,
    plan: result.plan,
    is_new: result.is_new,
  });
}

function serialize(review: Awaited<ReturnType<typeof getCurrentReview>>['review']) {
  return { ...review, coach_id: review.coach_id.toString() };
}
