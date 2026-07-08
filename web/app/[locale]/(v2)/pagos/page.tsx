// v2 · PAGOS (#15) — server component. Gates on the coach session, loads the
// roster billing (subscriptions + the local invoice mirror) and hands it to the
// client panel. Mirrors metricas/page.tsx: force-dynamic, one guarded load, no
// invented data — everything comes from lib/coach/billing.listCoachBilling.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listCoachBilling, type CoachBilling } from '@/lib/coach/billing';
import { PagosPanel } from '@/components/v2/pagos/PagosPanel';

export const dynamic = 'force-dynamic';

const EMPTY_BILLING: CoachBilling = {
  athletes: [],
  active_count: 0,
  past_due_count: 0,
  canceled_count: 0,
  not_subscribed_count: 0,
  comp_count: 0,
  upcoming_renewals_7d: [],
  mrr_cents: 0,
};

export default async function V2PagosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  // Degrade to an empty roster rather than 500-ing the page if the load fails.
  const data = await listCoachBilling({ coach_id: session.coach_id }).catch(() => EMPTY_BILLING);

  return <PagosPanel data={data} />;
}
