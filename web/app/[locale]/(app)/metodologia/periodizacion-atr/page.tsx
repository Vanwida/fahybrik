import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { AtrPeriodizationSection } from '@/components/dashboard/methodology/AtrPeriodizationSection';

export const dynamic = 'force-dynamic';

// Metodología · Área 2 — Periodización ATR (spec §4 · Área 2).
export default async function AtrPeriodizationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  return <AtrPeriodizationSection />;
}
