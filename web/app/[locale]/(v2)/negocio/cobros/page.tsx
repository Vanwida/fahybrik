// Negocio › Cobros — quién te debe y quién renueva, con acciones.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listCoachBilling } from '@/lib/coach/billing';
import { listOpenInvoices, stripeDashboardBase } from '@/lib/coach/cobros';
import { CobrosScreen } from '@/components/v2/pagos/CobrosScreen';
import { CobrosLoadError } from '@/components/v2/pagos/CobrosLoadError';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cobros · Negocio' };

export default async function CobrosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;

  const [data, open] = await Promise.all([
    listCoachBilling({ coach_id: session.coach_id }).catch(() => null),
    listOpenInvoices(session.coach_id).catch(() => new Map()),
  ]);
  if (!data) return <CobrosLoadError />;

  const openInvoices = Object.fromEntries([...open.entries()].map(([id, inv]) => [id, inv.amount_cents]));
  return <CobrosScreen data={data} openInvoices={openInvoices} stripeBase={stripeDashboardBase()} />;
}
