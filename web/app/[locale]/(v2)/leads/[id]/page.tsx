// v2 · LEAD · DETALLE — server component. Validates the lead id, gates on the coach
// session, loads the full onboarding detail (identity + contact + every answer,
// grouped by block), and hands it to the client orchestrator. A bad / non-existent
// id → notFound(). This is what Pablo reads to prep the call before the alta.

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getLeadDetail, listCoachLevels } from '@/lib/dashboard/coach/leads';
import { loadStripeConfig } from '@/lib/stripe';
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
    // Tenancy: scoped to the session's club (coachOwnsLead rule) — an alien lead → notFound().
    getLeadDetail(BigInt(leadId), session.coach_id),
    listCoachLevels(session.coach_id),
  ]);
  if (!lead) notFound();

  // #15 — is Stripe billing wired in this env? Drives the alta modal's cobro path:
  // when unconfigured, the paid path is hidden (cortesía only) so the coach never
  // hits a checkout error instead of a raw 503 on a coach action.
  const stripeConfigured = loadStripeConfig().ok;

  return <LeadDetalle lead={lead} levels={levels} stripeConfigured={stripeConfigured} />;
}
