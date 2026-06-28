// v2 · ATLETA · DÍA — server component for the PER-ATHLETE day editor (Fase 2).
// Gates on the coach session, validates the athlete id + ISO date, loads the
// athlete's assigned instance(s) for that day, and renders the reused session
// editor pointed at the athlete's copy. A non-owned athlete / bad date → 404.

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadAthleteDayEditor } from '@/lib/dashboard/coach/athlete-day-editor';
import { AthleteDayEditorScreen } from '@/components/v2/atleta-detalle/AthleteDayEditorScreen';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function V2AthleteDayEditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; date: string }>;
}) {
  const { locale, id, date } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const athleteId = Number(id);
  if (!Number.isFinite(athleteId) || athleteId <= 0) notFound();
  if (!ISO_DATE.test(date)) notFound();

  const data = await loadAthleteDayEditor({
    coach_id: session.coach_id,
    athlete_id: athleteId,
    iso_date: date,
  });
  if (!data) notFound();

  return <AthleteDayEditorScreen data={data} />;
}
