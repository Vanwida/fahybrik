import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadCoachPhases } from '@/lib/dashboard/coach/phases';
import { AtrPeriodizationSection } from '@/components/dashboard/methodology/AtrPeriodizationSection';

export const dynamic = 'force-dynamic';

// Metodología · Área 2 — Periodización (per-coach, agnostic phases, mig. 0052).
export default async function AtrPeriodizationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  // Server-load the coach's real phases (degrades to [] if mig. 0052 is unapplied
  // — the editor then offers the "usar set ATR por defecto" seed).
  const phases = await loadCoachPhases(session.coach_id);

  return <AtrPeriodizationSection initialPhases={phases} />;
}
