import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getReviewById } from '@/lib/coach/weekly-review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }
  const { id } = await context.params;
  const review = await getReviewById({ coach_id: session.coach_id, review_id: id });
  if (!review) {
    return jsonError('not_found', 'Review not found', 404);
  }
  return jsonOk({
    review: { ...review, coach_id: review.coach_id.toString() },
  });
}
