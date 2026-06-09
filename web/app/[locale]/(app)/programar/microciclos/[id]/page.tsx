import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadMonthTemplateWithWeeks } from '@/lib/dashboard/coach/program-months';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import {
  MicrocycleEditor,
  type MicrocycleEditorAthlete,
} from '@/components/dashboard/programming/MicrocycleEditor';

export const dynamic = 'force-dynamic';

function resolveActiveWeekIndex(
  param: string | string[] | undefined,
  available: number[],
): number {
  const raw = Array.isArray(param) ? param[0] : param;
  if (raw != null) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && available.includes(parsed)) return parsed;
  }
  return available[0] ?? 0;
}

export default async function MicrocyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const [{ locale, id }, search] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const monthIdNum = Number(id);
  if (!Number.isFinite(monthIdNum)) notFound();

  const data = await loadMonthTemplateWithWeeks({
    coach_id: session.coach_id,
    month_id: monthIdNum,
  });
  if (!data) notFound();

  const availableIndexes = data.weeks.map((w) => w.week_index);
  const activeWeekIndex = resolveActiveWeekIndex(search?.week, availableIndexes);

  let athletes: MicrocycleEditorAthlete[] = [];
  try {
    const rows = await fetchAthletesForCoach({ coach_id: session.coach_id });
    athletes = rows.map((r) => ({ id: r.athlete_id, full_name: r.full_name }));
  } catch {
    athletes = [];
  }

  return (
    <MicrocycleEditor
      month={data.month}
      weeks={data.weeks}
      activeWeekIndex={activeWeekIndex}
      athletes={athletes}
    />
  );
}
