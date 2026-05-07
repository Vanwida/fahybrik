'use client';

import type { FilterState, AtrBlockType } from '@/lib/coach/types';
import { ATR_BLOCK_TYPES } from '@/lib/coach/types';

interface CohortFiltersProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  totalCount: number;
  filteredCount: number;
}

interface ChipProps {
  label: string;
  active?: boolean;
  onClick: () => void;
}

function Chip({ label, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-7 rounded-full border px-2.5 text-xs uppercase tracking-[0.12em] transition-colors ${
        active
          ? 'border-[color:var(--accent)]/40 bg-[color:var(--accent)]/12 text-[color:var(--accent)]'
          : 'border-[color:var(--hairline)] bg-[color:var(--surface)] text-[color:var(--muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]'
      }`}
    >
      {label}
    </button>
  );
}

export function CohortFilters({ filters, onChange, totalCount, filteredCount }: CohortFiltersProps) {
  function toggle<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    const next = { ...filters };
    if (next[key] === value) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  }

  function setBlock(block: AtrBlockType | undefined) {
    const next = { ...filters };
    if (block === undefined || next.block === block) delete next.block;
    else next.block = block;
    onChange(next);
  }

  const isAny = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip
        label="Hoy en gym"
        active={filters.in_gym === true}
        onClick={() => toggle('in_gym', true)}
      />
      <Chip
        label="Con alerta"
        active={filters.alert === true}
        onClick={() => toggle('alert', true)}
      />
      <Chip
        label="2x/día hoy"
        active={filters.twice_daily === true}
        onClick={() => toggle('twice_daily', true)}
      />
      <Chip
        label="A-event ≤30d"
        active={filters.a_event_30d === true}
        onClick={() => toggle('a_event_30d', true)}
      />
      <span className="mx-1 h-5 w-px bg-[color:var(--hairline)]" aria-hidden />
      {ATR_BLOCK_TYPES.map((b) => (
        <Chip
          key={b}
          label={b}
          active={filters.block === b}
          onClick={() => setBlock(b)}
        />
      ))}

      <span className="ml-auto text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)] tabular-nums">
        {isAny ? `${filteredCount} / ${totalCount}` : `${totalCount} atletas`}
      </span>
    </div>
  );
}
