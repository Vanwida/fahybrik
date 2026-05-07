import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { saveReview } from '@/lib/coach/weekly-review';
import { saveWeeklyReviewRequestSchema } from '@/lib/coach/weekly-review-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }

  const parsed = saveWeeklyReviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Body failed validation', 400, parsed.error.flatten());
  }

  const review = await saveReview({
    coach_id: session.coach_id,
    iso_week_start: parsed.data.iso_week_start,
    action: parsed.data.action,
    decisions: parsed.data.decisions,
    notes: parsed.data.notes,
    plan_edits: parsed.data.plan_edits,
    duration_ms: parsed.data.duration_ms,
  });

  return jsonOk({
    review: { ...review, coach_id: review.coach_id.toString() },
  });
}
