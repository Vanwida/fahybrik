// v2 · SCREEN 7 · MICROCICLO — server component for the UNIFIED canvas. Loads ONE
// real microcycle (program_month_templates → its weeks → slots) via
// loadMonthTemplateWithWeeks, derives each week's day modalities + session
// content, and hands a flattened, client-safe model to the editor. A missing/
// foreign microcycle → EmptyState.
//
// ONE canvas, two zoom levels driven by the `?dia=N` query param (no separate
// day route): no `?dia` → SEMANA (the week calendar); `?dia=N` → DÍA (the same
// canvas compacts the week to a strip + opens the day editor). When `?dia` is a
// valid flat day index, this page ALSO loads that day's editor model server-side
// (loadDayEditorModel) so switching days is a smooth in-place soft navigation.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadMonthTemplateWithWeeks } from '@/lib/dashboard/coach/program-months';
import {
  deriveWeekModalities,
  weekSessionCount,
  type DayModalityInfo,
} from '@/lib/dashboard/v2/planes-model';
import { loadDayEditorModel } from '@/lib/dashboard/v2/editor-data';
import { MicrocicloEditor, type MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import { EmptyState } from '@/components/v2/EmptyState';

export const dynamic = 'force-dynamic';

const DAYS_PER_WEEK = 7;

export default async function V2MicrocicloPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ dia?: string }>;
}) {
  const { locale, id } = await params;
  const { dia } = await searchParams;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const monthId = Number(id);
  if (!Number.isFinite(monthId)) {
    return <NotFound description="El identificador del microciclo no es válido." />;
  }

  const coach_id = session.coach_id;

  const full = await loadMonthTemplateWithWeeks({ coach_id, month_id: monthId }).catch(() => null);

  if (!full) {
    return <NotFound description="Este microciclo no existe o no pertenece a tu biblioteca." />;
  }

  const sorted = full.weeks.slice().sort((a, b) => a.week_index - b.week_index);

  const weeks: MicroWeek[] = sorted.map((w, i) => {
    const days: DayModalityInfo[] = deriveWeekModalities(w.slots_json);
    return {
      id: w.id,
      index: i,
      name: w.name,
      focus: w.focus,
      label: w.focus ?? `Semana ${i + 1}`,
      session_count: weekSessionCount(days),
      days,
    };
  });

  // DÍA zoom level: `?dia=N` is a valid flat day index across the microciclo →
  // load that day's editor model on the SAME canvas. Out-of-range / non-numeric
  // → ignored (the canvas stays in the SEMANA state). The week calendar and the
  // day editor share this single server render, so switching `?dia` is a soft,
  // in-place navigation (no full page reload).
  const totalDays = weeks.length * DAYS_PER_WEEK;
  const dayIndex = dia !== undefined ? Number(dia) : null;
  const activeDay =
    dayIndex !== null && Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex < totalDays
      ? dayIndex
      : null;

  const dayModel =
    activeDay !== null
      ? await loadDayEditorModel({ coach_id, month_id: monthId, day_index: activeDay }).catch(
          () => null,
        )
      : null;

  return (
    <MicrocicloEditor
      microcycle_id={id}
      name={full.month.name}
      level={full.month.level}
      weeks={weeks}
      dayModel={dayModel}
    />
  );
}

function NotFound({ description }: { description: string }) {
  return (
    <div className="mx-auto w-full max-w-[var(--v2-container)] py-10">
      <EmptyState icon="error" title="Microciclo no encontrado" description={description} />
    </div>
  );
}
