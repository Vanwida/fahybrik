import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { MethodologyShell } from '@/components/dashboard/methodology/MethodologyShell';

export const dynamic = 'force-dynamic';

// Metodología — captura del cerebro metodológico del coach en estructura, para
// que la IA seleccione y adapte plantillas como él (template+IA). Landing con
// las 14 áreas del spec (docs/design/methodology-system/spec.md §4); 2 áreas
// construidas (Periodización ATR, Autorregulación), el resto listadas como
// "próximamente". Datos pre-cargados con los defaults reales de Pablo (mock
// local en lib/dashboard/coach/methodology/*; follow-up: wirear a la API).
export default async function MethodologyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  return <MethodologyShell />;
}
