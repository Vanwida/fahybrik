// v2 · ATLETAS — the full roster directory. Server component: loads the SAME real
// roster the v1 list uses (fetchAthletesForCoach: readiness, modality, adherence,
// programming_status, intake_pending, block/phase) and hands it to the client
// <RosterDirectory> for live search + client-side filters/sort. A dead loader
// degrades to an empty roster (EmptyState) rather than 500-ing the page.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import { listDoublesPairsForCoach } from '@/lib/dashboard/coach/doubles-pairs';
import { RosterDirectory } from '@/components/v2/atletas/RosterDirectory';

export const dynamic = 'force-dynamic';

export default async function V2AtletasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const [athletes, doubles_pairs] = await Promise.all([
    fetchAthletesForCoach({ coach_id: session.coach_id }).catch(() => []),
    listDoublesPairsForCoach(session.coach_id).catch(() => []),
  ]);

  return (
    <RosterDirectory
      athletes={athletes}
      coach_name={session.full_name}
      doubles_pairs={doubles_pairs}
    />
  );
}
