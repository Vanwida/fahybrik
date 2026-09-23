// Programar › Programas: la lista de programas de la biblioteca del coach.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listPrograms } from '@/lib/dashboard/programming/programs';
import { listLevelOptions } from '@/lib/coach/level-options';
import { loadCoachMaxMicrocicloWeeks } from '@/lib/coach/microcycle-limits';
import { ProgramasList } from '@/components/v2/planes/ProgramasList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Programas' };

export default async function ProgramasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const coachId = Number(session.coach_id);
  const [programs, levels, maxWeeks] = await Promise.all([
    listPrograms({ coach_id: coachId }).catch(() => null),
    listLevelOptions(coachId).catch(() => []),
    loadCoachMaxMicrocicloWeeks({ coach_id: coachId }).catch(() => 8),
  ]);
  return <ProgramasList programs={programs} levels={levels} maxWeeks={maxWeeks} />;
}
