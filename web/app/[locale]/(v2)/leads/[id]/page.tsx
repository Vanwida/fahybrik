// v2 · LEAD · DETALLE — server component. Validates the lead id, gates on the coach
// session, loads the full onboarding detail (identity + contact + every answer,
// grouped by block), and hands it to the client orchestrator. A bad / non-existent
// id → notFound(). This is what Pablo reads to prep the call before the alta.

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getLeadDetail, listCoachLevels } from '@/lib/dashboard/coach/leads';
import { LeadDetalle } from '@/components/v2/leads/LeadDetalle';

export const dynamic = 'force-dynamic';

export default async function V2LeadDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  // Positive, finite INTEGER only — BigInt() below throws on a fractional value.
  const leadId = Number(id);
  if (!Number.isFinite(leadId) || !Number.isInteger(leadId) || leadId <= 0) notFound();

  const [lead, levels] = await Promise.all([
    getLeadDetail(BigInt(leadId)),
    listCoachLevels(session.coach_id),
  ]);
  if (!lead) notFound();

  return <LeadDetalle lead={lead} levels={levels} />;
}
