// v2 · LEADS — the web-onboarding prospect list. Server component: gates on the
// coach session and loads the standalone `leads` table (fully isolated from the
// athletes roster — a lead is NOT an athlete until the alta flow converts it). All
// filtering/search happens client-side in <LeadsDirectory> over this one payload.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listLeadsForCoach } from '@/lib/dashboard/coach/leads';
import { listUpcomingCalls } from '@/lib/citas/store';
import { getCapacityState } from '@/lib/coach/capacity';
import { listWaitlist } from '@/lib/leads/waitlist';
import { LeadsDirectory } from '@/components/v2/leads/LeadsDirectory';

export const dynamic = 'force-dynamic';

export default async function V2LeadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  // Each source is independently guarded (mirrors hoy/page.tsx): a dead capacity or
  // waitlist read degrades ITS widget (chip hidden / card absent), never 500s the page.
  const [data, upcomingCalls, capacity, waitlist] = await Promise.all([
    listLeadsForCoach(),
    listUpcomingCalls(),
    getCapacityState().catch(() => null),
    listWaitlist().catch(() => []),
  ]);

  return (
    <LeadsDirectory
      {...data}
      upcomingCalls={upcomingCalls}
      capacity={capacity}
      waitlist={waitlist}
    />
  );
}
