'use client';

// v2 · SCREEN 7 · MICROCICLO — the UNIFIED canvas orchestrator. ONE canvas, two
// zoom levels driven by the `?dia=N` query param (resolved server-side into
// `dayModel`):
//   · no day (SEMANA) — a SegmentedControl toggles between two WEEK views over
//     the SAME real microcycle data:
//       · "Editor · semana en foco" (default) — one week expanded into 7 full-
//         height day columns (weekly calendar) under a week-step header.
//       · "Vista general · N semanas" — the week×day grid.
//     Day cells link to `/microciclos/[id]?dia=idx` (in-place, no navigation).
//   · with day (DÍA) — the SAME canvas zooms in: the week compacts to the slim
//     WeekContextStrip (rendered inside DayEditor) and the day editor fills below.
//     "← Volver a la semana" clears `?dia` and returns to the week calendar.

import { useState } from 'react';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import type { DayModalityInfo, WeekLoad } from '@/lib/dashboard/v2/planes-model';
import type { DayEditorModel } from '@/lib/dashboard/v2/editor-types';
import { MicrocicloV2 } from '@/components/v2/planes/MicrocicloV2';
import { MicrocicloV1 } from '@/components/v2/planes/MicrocicloV1';
import { DayEditor } from '@/components/v2/editor/DayEditor';

export interface MicroWeek {
  id: string;
  index: number;
  name: string;
  focus: string | null;
  /** Short etiqueta (atr hint / focus / "Semana k"). */
  label: string;
  session_count: number;
  /** Always 7 entries, Mon→Sun. */
  days: DayModalityInfo[];
  load: WeekLoad | null;
}

type ViewMode = 'foco' | 'general';

// Week count is the coach's choice (a microciclo can be 2, 3, 5, 6… weeks) —
// derive the label from the real data, never hardcode it.
const viewOptions = (weekCount: number) => [
  { value: 'foco' as const, label: 'Editor · semana en foco' },
  {
    value: 'general' as const,
    label: `Vista general · ${weekCount} ${weekCount === 1 ? 'semana' : 'semanas'}`,
  },
];

export function MicrocicloEditor({
  microcycle_id,
  name,
  level,
  weeks,
  groupNames,
  dayModel,
}: {
  microcycle_id: string;
  name: string;
  level: string;
  weeks: MicroWeek[];
  /** methodology_group_id → coach label (agnostic; for the per-block group tag). */
  groupNames: Record<number, string>;
  /** DÍA zoom level: present iff `?dia=N` resolved to a real day server-side. */
  dayModel?: DayEditorModel | null;
}) {
  const [view, setView] = useState<ViewMode>('foco');

  // DÍA zoom level — the canvas shows the day editor (which carries its own week-
  // context strip on top). Switching `?dia` re-renders this page server-side as a
  // soft navigation, so the week↔day transition stays in place (no full reload).
  if (dayModel) {
    return <DayEditor model={dayModel} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col">
      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="v2-display truncate text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-muted)]">Microciclo · </span>
            <span className="text-[color:var(--v2-fg)]">«{name}»</span>
          </h1>
          <p className="text-sm capitalize text-[color:var(--v2-muted)]">{level}</p>
        </div>
        <SegmentedControl
          options={viewOptions(weeks.length)}
          value={view}
          onChange={setView}
          ariaLabel="Vista del microciclo"
        />
      </div>

      <div className="mt-4">
        {view === 'foco' ? (
          <MicrocicloV2
            microcycle_id={microcycle_id}
            weeks={weeks}
            groupNames={groupNames}
          />
        ) : (
          <MicrocicloV1 microcycle_id={microcycle_id} weeks={weeks} />
        )}
      </div>
    </div>
  );
}
