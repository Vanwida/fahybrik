'use client';

// v2 · SCREEN 6 · PLAN POR FASES — client orchestrator. Three vertical panels:
//   ① Fases (240px)  · the coach's periodization phases + draft/published gate
//   ② Semanas (420px)· week cards derived from the selected phase's duration,
//                       each a WeekStrip of real (or empty) day modalities
//   ③ Día/sesión     · the selected day's sessions + library candidates + a
//                       suggestion card + the borrador→publicar publish gate.
// Selection state (phase → week → day) lives here; the panels are presentational.

import { useMemo, useState } from 'react';
import type { DayModalityInfo, PlanPhase } from '@/lib/dashboard/v2/planes-model';
import { loadCurve } from '@/lib/dashboard/v2/planes-model';
import type { V2Modality } from '@/components/v2/constants';
import { PhasesPanel } from '@/components/v2/planes/PhasesPanel';
import { WeeksPanel } from '@/components/v2/planes/WeeksPanel';
import { DayPanel } from '@/components/v2/planes/DayPanel';

export interface PlanSessionCandidate {
  id: string;
  name: string;
  modality: V2Modality;
  block_count: number;
}

const EMPTY_WEEK: DayModalityInfo[] = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i + 1,
  modalities: [],
  dominant: null,
  session_count: 0,
  block_count: 0,
  item_count: 0,
  is_rest: false,
  focus: null,
  sessions: [],
}));

export function PlanPorFases({
  phases,
  seed_weeks,
  candidates,
  first_month_id,
}: {
  phases: PlanPhase[];
  /** Real day-modality data per week from the coach's first microcycle (may be []). */
  seed_weeks: DayModalityInfo[][];
  candidates: PlanSessionCandidate[];
  first_month_id: string | null;
}) {
  const [phaseId, setPhaseId] = useState(phases[0]?.id ?? '');
  const [weekIndex, setWeekIndex] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);

  const phase = useMemo(
    () => phases.find((p) => p.id === phaseId) ?? phases[0],
    [phases, phaseId],
  );

  // Weeks of the selected phase: N derived from phase.week_count. Each week's day
  // strip is the real seed if we have one at that index, else an empty week.
  const weeks: DayModalityInfo[][] = useMemo(() => {
    if (!phase) return [];
    return Array.from({ length: phase.week_count }, (_, i) => seed_weeks[i] ?? EMPTY_WEEK);
  }, [phase, seed_weeks]);

  const loads = useMemo(() => loadCurve(phase?.week_count ?? 0), [phase]);

  function selectPhase(id: string) {
    setPhaseId(id);
    setWeekIndex(0);
    setDayIndex(0);
  }
  function selectWeek(i: number) {
    setWeekIndex(i);
    setDayIndex(0);
  }

  const selectedWeek = weeks[weekIndex] ?? EMPTY_WEEK;
  const selectedDay = selectedWeek[dayIndex] ?? EMPTY_WEEK[dayIndex]!;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col">
      {/* Top bar */}
      <div className="flex flex-col gap-1.5">
        <h1 className="v2-display text-3xl sm:text-4xl">
          <span className="text-[color:var(--v2-fg)]">Plan por fases</span>
        </h1>
        <p className="text-sm text-[color:var(--v2-muted)]">
          Construir y asignar — fase a fase. Borrador → publicar.
        </p>
      </div>

      {/* Three panels */}
      <div className="mt-4 grid grid-cols-1 items-start gap-2.5 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_420px_minmax(0,1fr)]">
        <PhasesPanel
          phases={phases}
          selectedId={phase?.id ?? ''}
          onSelect={selectPhase}
        />
        <WeeksPanel
          phase={phase ?? null}
          weeks={weeks}
          loads={loads}
          selectedIndex={weekIndex}
          onSelect={selectWeek}
        />
        <DayPanel
          phase={phase ?? null}
          week={selectedWeek}
          weekIndex={weekIndex}
          day={selectedDay}
          dayIndex={dayIndex}
          onSelectDay={setDayIndex}
          candidates={candidates}
          first_month_id={first_month_id}
        />
      </div>
    </div>
  );
}
