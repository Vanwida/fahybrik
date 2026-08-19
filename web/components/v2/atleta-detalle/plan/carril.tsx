'use client';

import { Pill } from '@/components/v2/Pill';
import { formatRangoSemana } from '@/lib/dashboard/v2/ficha-resumen';
import { cn } from '@/lib/utils';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  railWeekLabel,
  type MicrocicloRailWeek,
} from '@fahybrid/shared/domain/coach/microciclo-rail';

function sundayOf(weekStart: string): string {
  return isoDateString(addDays(parseIsoDate(weekStart), 6));
}

/** Carril del microciclo: cada semana Visible o Borrador. No publica. */
export function MicrocicloRail({
  weeks,
  activeWeekStart,
  onSelect,
}: {
  weeks: MicrocicloRailWeek[];
  activeWeekStart: string | null;
  onSelect: (weekStart: string) => void;
}) {
  if (weeks.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Semanas del microciclo"
      className="flex flex-wrap gap-2"
    >
      {weeks.map((w) => {
        const selected = w.week_start === activeWeekStart;
        const label = railWeekLabel(w.visible);
        return (
          <button
            key={w.week_start}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(w.week_start)}
            className={cn(
              'v2-focus flex min-w-[7.5rem] flex-1 flex-col gap-1 rounded-[10px] px-2 py-1.5 text-left',
              selected
                ? 'bg-[color:var(--v2-accent-soft)]'
                : 'bg-[color:var(--v2-surface-2)]',
            )}
          >
            <span className="v2-num text-[10px] text-[color:var(--v2-muted)]">
              {formatRangoSemana(w.week_start, sundayOf(w.week_start))}
            </span>
            <Pill
              tone={w.visible ? 'ok' : 'warn'}
              variant="soft"
              title={w.visible ? 'El atleta ve esta semana' : 'Borrador · el atleta no la ve'}
            >
              {label}
            </Pill>
          </button>
        );
      })}
    </div>
  );
}
