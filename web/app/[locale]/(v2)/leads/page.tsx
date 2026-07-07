// v2 · LEADS — the web-onboarding prospect list. Server component: gates on the
// coach session and loads the standalone `leads` table (fully isolated from the
// athletes roster — a lead is NOT an athlete until the alta flow converts it). All
// filtering/search happens client-side in <LeadsDirectory> over this one payload.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listLeadsForCoach } from '@/lib/dashboard/coach/leads';
import { listUpcomingCalls } from '@/lib/citas/store';
import { LeadsDirectory } from '@/components/v2/leads/LeadsDirectory';

export const dynamic = 'force-dynamic';

export default async function V2LeadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const [data, upcomingCalls] = await Promise.all([
    listLeadsForCoach(),
    listUpcomingCalls(),
  ]);

  return <LeadsDirectory {...data} upcomingCalls={upcomingCalls} />;
}
