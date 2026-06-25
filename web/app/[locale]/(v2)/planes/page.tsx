// v2 · SCREEN 6 · PLAN POR FASES — server component. Loads the REAL phase set
// (ATR defaults via buildPlanPhases), the coach's session library (candidates for
// the day panel) and — when the coach already has a microcycle — its real weekly
// slots, which seed the derived weeks' day strips with genuine modality data.
// Independent safe loads: a dead loader degrades its contribution, never 500s.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listTemplatesForCoach } from '@/lib/dashboard/coach/templates';
import {
  listMonthTemplatesForCoach,
  loadMonthTemplateWithWeeks,
} from '@/lib/dashboard/coach/program-months';
import {
  buildPlanPhases,
  deriveWeekModalities,
  modalityForGroup,
  type DayModalityInfo,
} from '@/lib/dashboard/v2/planes-model';
import type { V2Modality } from '@/components/v2/constants';
import { PlanPorFases, type PlanSessionCandidate } from '@/components/v2/planes/PlanPorFases';

export const dynamic = 'force-dynamic';

export default async function V2PlanesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const coach_id = session.coach_id;

  // Session library (candidates) + the coach's microcycles (for real day strips).
  const [templates, months] = await Promise.all([
    listTemplatesForCoach(coach_id).catch(() => []),
    listMonthTemplatesForCoach(coach_id).catch(() => []),
  ]);

  // Pull the most-recent microcycle's real weekly slots to seed week day-strips
  // with genuine modality data. If none exists the screen still renders (empty
  // derived weeks → EmptyState + builder canvas).
  let seedWeeks: DayModalityInfo[][] = [];
  const firstMonthId = months[0]?.id;
  if (firstMonthId) {
    const full = await loadMonthTemplateWithWeeks({
      coach_id,
      month_id: Number(firstMonthId),
    }).catch(() => null);
    if (full) {
      seedWeeks = full.weeks
        .slice()
        .sort((a, b) => a.week_index - b.week_index)
        .map((w) => deriveWeekModalities(w.slots_json));
    }
  }

  const candidates: PlanSessionCandidate[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    modality: (modalityForGroup(t.methodology_group_id) ?? 'circuito') as V2Modality,
    block_count: t.block_count,
  }));

  return (
    <PlanPorFases
      phases={buildPlanPhases()}
      seed_weeks={seedWeeks}
      candidates={candidates}
      first_month_id={firstMonthId ?? null}
    />
  );
}
