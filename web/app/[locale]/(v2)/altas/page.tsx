// v2 · ALTAS — the pending-intake queue. Server component: loads the coach's
// athletes whose intake is still pending (onboarded but not yet reviewed) via the
// EXISTING listPendingIntake loader, and renders the queue. This is the home of
// the "alta sin revisar" lane surfaced from the roster + /hoy.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listPendingIntake } from '@/lib/coach/intake';
import { withAltaLife } from '@/lib/coach/load-alta-life';
import { ALTA_LIFE_UNVERIFIED } from '@fahybrid/shared/domain/coach/alta-stance';
import { AltasQueue } from '@/components/v2/intake/AltasQueue';

export const dynamic = 'force-dynamic';

export default async function AltasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const raw = await listPendingIntake({ coach_id: session.coach_id }).catch(() => []);
  const pending = await withAltaLife(raw).catch(() =>
    raw.map((p) => ({ ...p, life: ALTA_LIFE_UNVERIFIED })),
  );

  return <AltasQueue pending={pending} />;
}
