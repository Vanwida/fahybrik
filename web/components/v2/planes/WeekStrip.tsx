'use client';

// WeekStrip — the shared 7-day modality strip (L M X J V S D). Each cell is
// colored by that day's DOMINANT training modality; a rest day reads as a dashed
// hollow cell. Used by Screen 6 (each derived week card) and Screen 7 (week-step
// glance). Pure presentational: it takes the already-derived DayModalityInfo[]
// (deriveWeekModalities) so the same color logic powers both screens.

import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import { DAY_LABELS_SHORT, type DayModalityInfo } from '@/lib/dashboard/v2/planes-model';
import { cn } from '@/lib/utils';

function cellTitle(day: DayModalityInfo, dayLabel: string): string {
  if (day.session_count === 0) return `${dayLabel} · descanso`;
  const mods = day.modalities.map((m) => MODALITY_META[m].label);
  const modText = mods.length ? mods.join(' + ') : 'Entreno';
  const ses = day.session_count > 1 ? ` · ${day.session_count} sesiones` : '';
  return `${dayLabel} · ${modText}${ses}`;
}

export function WeekStrip({
  days,
  size = 'md',
  showLabels = true,
  className,
}: {
  /** Always 7 entries, Mon→Sun (deriveWeekModalities output). */
  days: DayModalityInfo[];
  size?: 'sm' | 'md';
  /** Render the L M X J V S D header row above the cells. */
  showLabels?: boolean;
  className?: string;
}) {
  const cellH = size === 'sm' ? 'h-6' : 'h-8';

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {showLabels ? (
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS_SHORT.map((l, i) => (
            <span
              key={i}
              aria-hidden
              className="text-center text-[9px] font-bold uppercase tracking-wider text-[color:var(--v2-faint)]"
            >
              {l}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const dayLabel = DAY_LABELS_SHORT[i] ?? '';
          const rest = day.session_count === 0;
          const mod: V2Modality | null = day.dominant;
          const title = cellTitle(day, dayLabel);

          if (rest || !mod) {
            return (
              <span
                key={day.day_of_week}
                title={title}
                aria-label={title}
                className={cn(
                  'flex items-center justify-center rounded-[var(--v2-r-xs)]',
                  'border border-dashed border-[color:var(--v2-border)]',
                  cellH,
                )}
              >
                <span className="text-[10px] text-[color:var(--v2-faint)]">·</span>
              </span>
            );
          }

          return (
            <span
              key={day.day_of_week}
              title={title}
              aria-label={title}
              className={cn(
                'relative flex items-center justify-center rounded-[var(--v2-r-xs)]',
                'border',
                cellH,
              )}
              style={{
                background: `var(${MODALITY_META[mod].softVar})`,
                borderColor: `color-mix(in srgb, var(${MODALITY_META[mod].colorVar}) 40%, transparent)`,
              }}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: `var(${MODALITY_META[mod].colorVar})` }}
              />
              {day.session_count > 1 ? (
                <span
                  aria-hidden
                  className="v2-num absolute right-0.5 top-0 text-[8px] font-bold"
                  style={{ color: `var(${MODALITY_META[mod].colorVar})` }}
                >
                  {day.session_count}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
