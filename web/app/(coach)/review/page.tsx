import { redirect } from 'next/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getCurrentReview, listHistory } from '@/lib/coach/weekly-review';
import { WeeklyReview } from '@/components/coach/WeeklyReview';

export const dynamic = 'force-dynamic';

export default async function CoachWeeklyReviewPage() {
  const session = await getCoachSession();
  if (!session) redirect('/auth/sign-in');

  const [current, history] = await Promise.all([
    getCurrentReview({ coach_id: session.coach_id }),
    listHistory({ coach_id: session.coach_id, limit: 12 }),
  ]);

  // Serialize the bigint coach_id for the client component.
  const review = { ...current.review, coach_id: current.review.coach_id.toString() };

  return (
    <WeeklyReview
      initial_review={review}
      initial_attention={current.attention}
      initial_transitions={current.transitions}
      initial_mass_adjustments={current.mass_adjustments}
      initial_plan={current.plan}
      history={history}
      coach_first_name={session.full_name.split(' ')[0]}
    />
  );
}
