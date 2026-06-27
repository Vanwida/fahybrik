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
//   · with day (DÍA) — the SAME canvas reflows to MASTER-DETAIL inside the week
//     calendar: the open day's COLUMN grows to host the editor inline while the
//     other six SHRINK to a thin clickable rail (the week IS the editor). The
//     column-grow animates; "← Semana completa" clears `?dia`.

import { useState } from 'react';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import type { DayModalityInfo, WeekLoad } from '@/lib/dashboard/v2/planes-model';
import type { DayEditorModel } from '@/lib/dashboard/v2/editor-types';
import { MicrocicloV2 } from '@/components/v2/planes/MicrocicloV2';
import { MicrocicloV1 } from '@/components/v2/planes/MicrocicloV1';

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

  // DÍA zoom level lives ON the week grid: MicrocicloV2 reflows to master-detail
  // (the open day's column grows into the editor, the rest become a thin rail) —
  // "the week IS the editor". So when a day is open we force the week-calendar
  // view (the matrix has no master-detail) and let MicrocicloV2 expand a column.
  // Switching `?dia` is a soft, in-place navigation, so the column-grow animates.
  const effectiveView: ViewMode = dayModel ? 'foco' : view;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col">
      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="v2-display truncate text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-muted)]">Microciclo · </span>
            <span className="text-[color:var(--v2-fg)]">«{name}»</span>
          </h1>
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-[color:var(--v2-muted)]">
            <span>{level}</span>
          </p>
        </div>
        {/* The view toggle is a full-week affordance; while a day is open the
            canvas is locked to the master-detail week calendar. */}
        {dayModel ? null : (
          <SegmentedControl
            options={viewOptions(weeks.length)}
            value={view}
            onChange={setView}
            ariaLabel="Vista del microciclo"
          />
        )}
      </div>

      <div className="mt-4">
        {effectiveView === 'foco' ? (
          <MicrocicloV2
            microcycle_id={microcycle_id}
            name={name}
            weeks={weeks}
            groupNames={groupNames}
            dayModel={dayModel}
          />
        ) : (
          <MicrocicloV1 microcycle_id={microcycle_id} weeks={weeks} />
        )}
      </div>
    </div>
  );
}
