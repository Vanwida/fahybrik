import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { AutoregulationSection } from '@/components/dashboard/methodology/AutoregulationSection';

export const dynamic = 'force-dynamic';

// Metodología · Área 7 — Autorregulación intra-sesión (spec §4 · Área 7).
// Aloja el constructor de reglas (componente clave).
export default async function AutoregulationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  return <AutoregulationSection />;
}
