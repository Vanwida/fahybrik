// Programar › Tests: la batería de calibración del coach.

import type { Metadata } from 'next';

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listCoachTests } from '@/lib/coach/coach-tests';
import { loadRosterForApply, loadTestReach } from '@/lib/coach/apply-test';
import { TestsView } from '@/components/v2/tests/TestsView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tests' };

export default async function V2TestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  // Reach + roster ride along with the list: the screen has to be able to say WHO has
  // each test (the column whose absence let a battery that reached nobody look fine)
  // and to apply one without a round-trip first.
  const [tests, reach, roster] = await Promise.all([
    listCoachTests(session.coach_id, {}).catch(() => []),
    loadTestReach(Number(session.coach_id)).catch(() => new Map()),
    loadRosterForApply(Number(session.coach_id)).catch(() => []),
  ]);

  return (
    <TestsView
      initialTests={tests}
      reach={Object.fromEntries(reach)}
      roster={roster}
    />
  );
}
