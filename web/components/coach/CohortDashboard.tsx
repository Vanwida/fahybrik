'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  BriefingLine,
  BriefingPayload,
  CohortRow,
  ColumnKey,
  ColumnPrefs,
  FilterState,
} from '@/lib/coach/types';
import { DEFAULT_COLUMNS } from '@/lib/coach/types';
import { DailyBriefing } from './DailyBriefing';
import { AtencionStrip } from './AtencionStrip';
import { CohortFilters } from './CohortFilters';
import { CohortTable } from './CohortTable';
import { ColumnPicker } from './ColumnPicker';
import { CohortBulkActions } from './CohortBulkActions';

interface CohortDashboardProps {
  initial_briefing: BriefingPayload;
  initial_cohort: CohortRow[];
  initial_columns: ColumnKey[];
}

export function CohortDashboard({
  initial_briefing,
  initial_cohort,
  initial_columns,
}: CohortDashboardProps) {
  const [briefing] = useState<BriefingPayload>(initial_briefing);
  const [cohort] = useState<CohortRow[]>(initial_cohort);
  const [columns, setColumns] = useState<ColumnKey[]>(
    initial_columns.length > 0 ? initial_columns : [...DEFAULT_COLUMNS],
  );
  const [filters, setFilters] = useState<FilterState>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filteredCount = useMemo(() => applyFilterCount(cohort, filters), [cohort, filters]);

  useEffect(() => {
    void persistColumns(columns);
  }, [columns]);

  function handleBriefingClick(line: BriefingLine) {
    if (line.filter_param === 'alert') {
      setFilters((f) => ({ ...f, alert: true }));
      scrollToCohort();
    } else if (line.filter_param === 'today') {
      setFilters((f) => ({ ...f, in_gym: true }));
      scrollToCohort();
    } else if (line.filter_param === 'transition') {
      setFilters((f) => ({ ...f, alert: true }));
      scrollToCohort();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <DailyBriefing briefing={briefing} onLineClick={handleBriefingClick} />
      <AtencionStrip rows={cohort} refreshed_relative="3m" />

      <section aria-label="Cohorte" className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
            Cohorte
          </h2>
          <ColumnPicker visible={columns} onChange={setColumns} />
        </header>
        <CohortFilters
          filters={filters}
          onChange={setFilters}
          totalCount={cohort.length}
          filteredCount={filteredCount}
        />
        <div id="cohort-table">
          <CohortTable
            rows={cohort}
            columns={columns}
            filters={filters}
            selected={selected}
            onSelectChange={setSelected}
          />
        </div>
      </section>

      <CohortBulkActions
        selected_count={selected.size}
        onClear={() => setSelected(new Set())}
      />
    </div>
  );
}

function applyFilterCount(rows: CohortRow[], filters: FilterState): number {
  return rows.filter((r) => {
    if (filters.in_gym && !r.in_gym_today) return false;
    if (filters.alert && r.alerts.length === 0) return false;
    if (filters.twice_daily && !r.flags.twice_daily_today) return false;
    if (filters.a_event_30d && !r.flags.a_event_within_30d) return false;
    if (filters.block && r.block_type !== filters.block) return false;
    return true;
  }).length;
}

function scrollToCohort() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('cohort-table');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function persistColumns(visible: ColumnKey[]): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/coach/cohort/columns', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visible } satisfies ColumnPrefs),
    });
  } catch {
    // best-effort persistence — failure means prefs revert next session
  }
}
