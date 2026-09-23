// Ajustes › Agenda y cupo — plazas, horarios de llamada y días libres.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getAvailability } from '@/lib/citas/store';
import { getCapacityState } from '@/lib/coach/capacity';
import { AjustesPanel } from '@/components/v2/ajustes/AjustesPanel';
import { AjustesLoadError } from '@/components/v2/ajustes/AjustesLoadError';
import { AgendaEditor } from '@/components/v2/citas/AgendaEditor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Agenda y cupo · Ajustes' };

export default async function AgendaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;

  const [availability, capacity] = await Promise.all([
    getAvailability(session.coach_id).catch(() => null),
    getCapacityState(session.coach_id).catch(() => null),
  ]);

  return (
    <AjustesPanel title="Agenda y cupo" subtitle="Cuándo pueden reservar llamada tus leads y cuántas plazas tienes.">
      {availability ? (
        <AgendaEditor windows={availability.windows} exceptions={availability.exceptions} capacity={capacity} />
      ) : (
        <AjustesLoadError what="tu agenda" />
      )}
    </AjustesPanel>
  );
}
