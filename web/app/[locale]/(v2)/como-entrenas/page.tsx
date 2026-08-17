// v2 · CÓMO ENTRENAS — la entrevista del oficio. Siete capítulos, no un recuadro.
// El servidor carga la fila (o el vacío) y el cliente toca casillas + espejo.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getCoachMethodInterview } from '@/lib/coach/method-interview';
import { emptyInterview, INTERVIEW_QUESTION_COUNT } from '@fahybrid/shared/domain/coach/method-interview';
import { ComoEntrenarView } from '@/components/v2/como-entrenas/ComoEntrenarView';

export const dynamic = 'force-dynamic';

export default async function ComoEntrenarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const initial = await getCoachMethodInterview(session.coach_id).catch(() => ({
    ...emptyInterview(),
    answered_count: 0,
    question_count: INTERVIEW_QUESTION_COUNT,
    updated_at: null,
  }));

  return <ComoEntrenarView initial={initial} />;
}
