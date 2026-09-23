// Negocio › Leads — la lista vive en el layout para que abrir un lead
// (/negocio/leads/[id], el panel de la derecha) no la vuelva a pintar ni
// pierda el filtro. Cada fuente se degrada sola: si una falla, se ve el resto.

import type { ReactNode } from 'react';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listLeadsForCoach } from '@/lib/dashboard/coach/leads';
import { listUpcomingCalls } from '@/lib/citas/store';
import { getCapacityState } from '@/lib/coach/capacity';
import { listWaitlist } from '@/lib/leads/waitlist';
import { LeadsScreen } from '@/components/v2/leads/LeadsScreen';
import { LeadsLoadError } from '@/components/v2/leads/LeadsLoadError';

export default async function LeadsLayout({ children }: { children: ReactNode }) {
  const session = await getCoachSession();
  if (!session) return null;

  const [data, upcomingCalls, capacity, waitlist] = await Promise.all([
    listLeadsForCoach(session.coach_id).catch(() => null),
    listUpcomingCalls(session.coach_id).catch(() => []),
    getCapacityState(session.coach_id).catch(() => null),
    listWaitlist(session.coach_id).catch(() => []),
  ]);

  return (
    <>
      {data ? (
        <LeadsScreen
          leads={data.leads}
          counts={data.counts}
          total={data.total}
          upcomingCalls={upcomingCalls}
          capacity={capacity}
          waitlist={waitlist}
        />
      ) : (
        <LeadsLoadError />
      )}
      {children}
    </>
  );
}
