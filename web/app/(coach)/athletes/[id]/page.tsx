import { notFound, redirect } from 'next/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import {
  AthleteDeepDiveError,
  buildAthleteDeepDive,
} from '@/lib/coach/athlete-deep-dive';
import { AthleteIdParamSchema } from '@/lib/coach/deep-dive-types';
import { AthleteDeepDive } from '@/components/coach/AthleteDeepDive';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AthleteResumenPage({ params }: PageProps) {
  const session = await getCoachSession();
  if (!session) redirect('/auth/sign-in');

  const { id } = await params;
  const parsed = AthleteIdParamSchema.safeParse({ id });
  if (!parsed.success) notFound();

  const deep_dive = await loadDeepDive(parsed.data.id, session.coach_id);
  return <AthleteDeepDive deep_dive={deep_dive} />;
}

async function loadDeepDive(athlete_id: string, coach_id: bigint | number) {
  try {
    return await buildAthleteDeepDive({ coach_id, athlete_id });
  } catch (err) {
    if (err instanceof AthleteDeepDiveError) {
      if (err.code === 'forbidden') redirect('/');
      notFound();
    }
    throw err;
  }
}
