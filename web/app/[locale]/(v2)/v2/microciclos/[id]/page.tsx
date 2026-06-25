// v2 · SCREEN 7 · MICROCICLO — server component. Loads ONE real microcycle
// (program_month_templates → its weeks → slots) via loadMonthTemplateWithWeeks,
// derives each week's day modalities + session content, and hands a flattened,
// client-safe model to the editor. A missing/foreign microcycle → EmptyState.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadMonthTemplateWithWeeks } from '@/lib/dashboard/coach/program-months';
import { listTemplatesForCoach } from '@/lib/dashboard/coach/templates';
import { listMethodologyGroups } from '@/lib/dashboard/coach/methodology-groups';
import {
  deriveWeekModalities,
  loadCurve,
  modalityForGroup,
  weekSessionCount,
  type DayModalityInfo,
} from '@/lib/dashboard/v2/planes-model';
import type { V2Modality } from '@/components/v2/constants';
import {
  MicrocicloEditor,
  type MicroWeek,
  type MicroLibraryItem,
} from '@/components/v2/planes/MicrocicloEditor';
import { EmptyState } from '@/components/v2/EmptyState';

export const dynamic = 'force-dynamic';

export default async function V2MicrocicloPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const monthId = Number(id);
  if (!Number.isFinite(monthId)) {
    return <NotFound description="El identificador del microciclo no es válido." />;
  }

  const coach_id = session.coach_id;

  const [full, templates, groups] = await Promise.all([
    loadMonthTemplateWithWeeks({ coach_id, month_id: monthId }).catch(() => null),
    listTemplatesForCoach(coach_id).catch(() => []),
    listMethodologyGroups().catch(() => []),
  ]);

  if (!full) {
    return <NotFound description="Este microciclo no existe o no pertenece a tu biblioteca." />;
  }

  // Agnostic group label map (coach data, never hardcoded) — drives the per-block
  // phase/group tag on the rich day cards.
  const groupNames: Record<number, string> = Object.fromEntries(
    groups.map((g) => [g.id, g.name_es]),
  );

  const sorted = full.weeks.slice().sort((a, b) => a.week_index - b.week_index);
  const loads = loadCurve(sorted.length);

  const weeks: MicroWeek[] = sorted.map((w, i) => {
    const days: DayModalityInfo[] = deriveWeekModalities(w.slots_json);
    return {
      id: w.id,
      index: i,
      name: w.name,
      focus: w.focus,
      label: w.atr_block_hint ?? w.focus ?? `Semana ${i + 1}`,
      session_count: weekSessionCount(days),
      days,
      load: loads[i] ?? null,
    };
  });

  const library: MicroLibraryItem[] = templates.slice(0, 12).map((t) => ({
    id: t.id,
    name: t.name,
    modality: (modalityForGroup(t.methodology_group_id) ?? 'circuito') as V2Modality,
    block_count: t.block_count,
  }));

  return (
    <MicrocicloEditor
      microcycle_id={id}
      name={full.month.name}
      level={full.month.level}
      weeks={weeks}
      library={library}
      groupNames={groupNames}
    />
  );
}

function NotFound({ description }: { description: string }) {
  return (
    <div className="mx-auto w-full max-w-[1480px] py-10">
      <EmptyState icon="error" title="Microciclo no encontrado" description={description} />
    </div>
  );
}
