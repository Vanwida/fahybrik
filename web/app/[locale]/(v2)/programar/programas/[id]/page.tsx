// Programar › un programa: la rejilla de todas sus semanas (ProgramEditor).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadProgramGrid } from '@/lib/dashboard/programming/programs';
import { listLibrary } from '@/lib/dashboard/programming/library';
import { ProgramEditor } from '@/components/v2/planes/ProgramEditor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Programa' };

export default async function ProgramaPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const programId = Number(id);
  if (!Number.isInteger(programId) || programId <= 0) notFound();
  const [grid, library] = await Promise.all([
    loadProgramGrid({ coach_id: session.coach_id, program_id: programId }),
    listLibrary({ coach_id: session.coach_id }).catch(() => ({ entrenos: [], bloques: [] })),
  ]);
  if (!grid) notFound();
  return (
    <ProgramEditor
      program={grid.program}
      weeks={grid.weeks.map((w) => ({ id: w.id, focus: w.focus, days: w.days }))}
      steps={grid.steps}
      library={[...library.entrenos, ...library.bloques]}
      levels={grid.levels}
      maxWeeks={grid.max_weeks}
    />
  );
}
