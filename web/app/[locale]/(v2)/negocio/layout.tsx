// Negocio — Leads · Cobros · Embudo, en una sola área con pestañas. Solo para
// el coach con el add-on (plan §1.7); sin él, cualquier ruta de aquí manda a Hoy.

import type { ReactNode } from 'react';
import { getCoachSession } from '@/lib/auth/coach-session';
import { PageHeader } from '@/components/v2/ui';
import { NegocioTabs } from '@/components/v2/leads/NegocioTabs';
import { requireNegocio } from './gate';

export default async function NegocioLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireNegocio(await getCoachSession(), locale);

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-4">
      <PageHeader title="Negocio">
        <NegocioTabs />
      </PageHeader>
      {children}
    </div>
  );
}
