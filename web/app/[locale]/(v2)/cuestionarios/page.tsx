// v2 · CUESTIONARIOS — las preguntas de alta las pone el coach. Server
// component: carga la lista (el preset nace si no hay ninguno) y se la
// entrega a <CuestionariosView>. Un loader muerto degrada a lista vacía.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listOnboardingForms } from '@/lib/coach/onboarding-forms';
import { CuestionariosView } from '@/components/v2/cuestionarios/CuestionariosView';

export const dynamic = 'force-dynamic';

export default async function V2CuestionariosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const forms = await listOnboardingForms(session.coach_id).catch(() => []);

  return <CuestionariosView initialForms={forms} />;
}
