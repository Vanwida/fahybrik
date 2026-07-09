// v2 · TESTS — "La batería que fija el punto de partida." Server component: loads
// the coach's calibration tests (coach_calibration_tests + results + agenda) and
// hands them to the client <TestsView>. A dead loader degrades to an empty battery
// (the empty state renders "Restaurar los 4 de FABRIK") instead of 500-ing.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listCoachTests } from '@/lib/coach/coach-tests';
import { TestsView } from '@/components/v2/tests/TestsView';

export const dynamic = 'force-dynamic';

export default async function V2TestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const tests = await listCoachTests(session.coach_id, {}).catch(() => []);

  return <TestsView initialTests={tests} />;
}
