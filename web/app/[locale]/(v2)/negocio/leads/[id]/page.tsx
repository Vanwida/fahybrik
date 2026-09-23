// /negocio/leads/[id] — el panel del lead sobre la lista (que pinta el layout).
// Un id malo o de otro club → 404 (tenencia: getLeadDetail filtra por dueño).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getLeadDetail, listCoachLevels } from '@/lib/dashboard/coach/leads';
import { getLevelAxisSetting } from '@/lib/coach/level-axis';
import { loadStripeConfig } from '@/lib/stripe';
import { DEFAULT_LEVEL_AXIS_LABEL } from '@fahybrid/shared/domain/coach/level-axis';
import { LeadPanel } from '@/components/v2/leads/LeadPanel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lead · Negocio' };

export default async function LeadPanelPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;

  const leadId = Number(id);
  if (!Number.isInteger(leadId) || leadId <= 0) notFound();

  const [lead, levels, axis] = await Promise.all([
    getLeadDetail(BigInt(leadId), session.coach_id),
    listCoachLevels(session.coach_id).catch(() => []),
    getLevelAxisSetting(session.coach_id).catch(() => null),
  ]);
  if (!lead) notFound();

  return (
    <LeadPanel
      lead={lead}
      levels={levels}
      axisLabel={axis?.effective_label ?? DEFAULT_LEVEL_AXIS_LABEL}
      stripeConfigured={loadStripeConfig().ok}
    />
  );
}
