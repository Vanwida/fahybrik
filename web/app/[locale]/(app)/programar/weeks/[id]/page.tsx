import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getWeekTemplate } from '@/lib/dashboard/coach/program-weeks';
import { ProgrammingWeekStudio } from '@/components/dashboard/programming/studio/ProgrammingWeekStudio';

export default async function WeekTemplatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const weekId = Number(id);
  if (!Number.isFinite(weekId)) notFound();

  const week = await getWeekTemplate({ coach_id: session.coach_id, id: weekId });
  if (!week) notFound();

  return (
    <ProgrammingWeekStudio week={week} />
  );
}
