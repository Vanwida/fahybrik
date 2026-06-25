'use client';

// v2 · SCREEN 7 · MICROCICLO — client orchestrator. A SegmentedControl toggles
// between two views over the SAME real microcycle data:
//   · V2 "Editor · semana en foco" (default) — one week expanded into 7 day
//     columns, week-step header, library rail.
//   · V1 "Vista general · 4 semanas" — the classic week×day grid.
// Both link day cells to /v2/microciclos/[id]/dia/[idx] (owned by the day editor).

import { useState } from 'react';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import type { DayModalityInfo, WeekLoad } from '@/lib/dashboard/v2/planes-model';
import type { V2Modality } from '@/components/v2/constants';
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

export interface MicroLibraryItem {
  id: string;
  name: string;
  modality: V2Modality;
  block_count: number;
}

type ViewMode = 'foco' | 'general';

const VIEW_OPTIONS = [
  { value: 'foco' as const, label: 'Editor · semana en foco' },
  { value: 'general' as const, label: 'Vista general · 4 semanas' },
];

export function MicrocicloEditor({
  microcycle_id,
  name,
  level,
  weeks,
  library,
  groupNames,
}: {
  microcycle_id: string;
  name: string;
  level: string;
  weeks: MicroWeek[];
  library: MicroLibraryItem[];
  /** methodology_group_id → coach label (agnostic; for the per-block group tag). */
  groupNames: Record<number, string>;
}) {
  const [view, setView] = useState<ViewMode>('foco');

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
          options={VIEW_OPTIONS}
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
            library={library}
            groupNames={groupNames}
          />
        ) : (
          <MicrocicloV1 microcycle_id={microcycle_id} weeks={weeks} />
        )}
      </div>
    </div>
  );
}
