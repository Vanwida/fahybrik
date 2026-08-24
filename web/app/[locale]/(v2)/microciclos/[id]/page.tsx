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
import {
  loadMonthTemplateWithWeeks,
  loadDeliveredCountsForWeeks,
} from '@/lib/dashboard/coach/program-months';
import {
  deriveWeekModalities,
  weekSessionCount,
  type DayModalityInfo,
} from '@/lib/dashboard/v2/planes-model';
import { loadDayEditorModel } from '@/lib/dashboard/v2/editor-data';
import { MicrocicloEditor, type MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import { Link } from '@/i18n/navigation';
import { ScreenNotice, screenNoticeActionClass } from '@/components/v2/ScreenState';

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
    return <NotFound description="El identificador del ciclo no es válido." />;
  }

  const coach_id = session.coach_id;

  const full = await loadMonthTemplateWithWeeks({ coach_id, month_id: monthId }).catch(() => null);

  if (!full) {
    return <NotFound description="Este ciclo no existe o no pertenece a tu biblioteca." />;
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

  // A PERSONAL plan (0164) has no level to pair against — athlete_id/athlete_name
  // tell the editor whose it is, so it can swap the library "Asignar a atleta"
  // action for the athlete context + an activate-in-place flow instead.
  const owner =
    full.month.athlete_id != null
      ? { athlete_id: full.month.athlete_id, athlete_name: full.month.athlete_name ?? '' }
      : null;

  // Plantilla vacía pero entregado con contenido (ver loadDeliveredCountsForWeeks):
  // el coach aterriza aquí desde la ficha del atleta y ve un andamio en blanco que
  // parece haber perdido su trabajo — solo se comprueba para un plan PERSONAL, y
  // solo cuando la plantilla realmente suma cero sesiones (si tiene contenido, no
  // hay nada que explicar).
  let deliveredElsewhere: { athlete_id: string; athlete_name: string; count: number } | null =
    null;
  const templateSessionTotal = weeks.reduce((sum, w) => sum + w.session_count, 0);
  if (owner && templateSessionTotal === 0) {
    const delivered = await loadDeliveredCountsForWeeks({
      coach_id,
      athlete_id: Number(owner.athlete_id),
      week_template_ids: full.weeks.map((w) => Number(w.id)),
    }).catch(() => ({ total_assignments: 0, weeks_with_content: 0 }));
    if (delivered.total_assignments > 0) {
      deliveredElsewhere = {
        athlete_id: owner.athlete_id,
        athlete_name: owner.athlete_name,
        count: delivered.total_assignments,
      };
    }
  }

  return (
    <MicrocicloEditor
      microcycle_id={id}
      name={full.month.name}
      level={full.month.level}
      weeks={weeks}
      dayModel={dayModel}
      owner={owner}
      deliveredElsewhere={deliveredElsewhere}
    />
  );
}

// La salida es la Biblioteca, que es de donde se llega aquí: antes esto era un
// callejón sin salida — el aviso arriba y el resto de la pantalla en blanco.
function NotFound({ description }: { description: string }) {
  return (
    <ScreenNotice
      icon="search_off"
      title="Ciclo no encontrado"
      description={description}
      action={
        <Link href="/biblioteca" className={screenNoticeActionClass}>
          Volver a la biblioteca
        </Link>
      }
    />
  );
}
