// v2 · DISPONIBILIDAD — the coach's videollamada availability. Server component: gates
// on the coach session and loads the weekly windows + upcoming blocked dates, then hands
// them to the client editor. Reachable from the "Citas pendientes" card on /leads.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getAvailability } from '@/lib/citas/store';
import { AvailabilityEditor } from '@/components/v2/citas/AvailabilityEditor';

export const dynamic = 'force-dynamic';

export default async function DisponibilidadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const { windows, exceptions } = await getAvailability();

  return <AvailabilityEditor initialWindows={windows} initialExceptions={exceptions} />;
}
