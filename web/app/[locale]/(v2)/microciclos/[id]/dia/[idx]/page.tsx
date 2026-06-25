// v2 · SCREEN 8 · EDITOR DE DÍA (AM/PM) — día › sesión › bloque › ítems.
// Server component: loads the real day from the microcycle (loadDayEditorModel
// over loadMonthTemplateWithWeeks) and hands it to the client <DayEditor>. `[idx]`
// is a flat 0-based day index across the month (week = floor(idx/7),
// day_of_week = idx%7 + 1).

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadDayEditorModel } from '@/lib/dashboard/v2/editor-data';
import { DayEditor } from '@/components/v2/editor/DayEditor';
import { EmptyState } from '@/components/v2/EmptyState';

export const dynamic = 'force-dynamic';

export default async function V2DayEditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; idx: string }>;
}) {
  const { locale, id, idx } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const monthId = Number(id);
  const dayIndex = Number(idx);
  if (!Number.isFinite(monthId) || !Number.isFinite(dayIndex) || dayIndex < 0) {
    return <NotFound description="La ruta del día no es válida." />;
  }

  const model = await loadDayEditorModel({
    coach_id: session.coach_id,
    month_id: monthId,
    day_index: dayIndex,
  }).catch(() => null);

  if (!model) {
    return <NotFound description="Este microciclo no existe o no pertenece a tu biblioteca." />;
  }

  return <DayEditor model={model} />;
}

function NotFound({ description }: { description: string }) {
  return (
    <div className="mx-auto w-full max-w-[1480px] py-10">
      <EmptyState icon="error" title="Día no encontrado" description={description} />
    </div>
  );
}
