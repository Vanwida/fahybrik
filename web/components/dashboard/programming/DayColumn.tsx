import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DayColumnProps {
  dayLabel: string;
  dateLabel?: string | undefined;
  isToday?: boolean | undefined;
  children?: ReactNode | undefined;
  onAdd?: (() => void) | undefined;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
  variant?: 'default' | 'ficha' | undefined;
}

export function DayColumn({
  dayLabel,
  dateLabel,
  isToday,
  children,
  onAdd,
  onClick,
  className,
  variant = 'default',
}: DayColumnProps) {
  const Tag = onClick ? 'button' : 'div';
  const isFicha = variant === 'ficha';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-h-[100px] flex-col text-left',
        !isFicha && 'bg-[color:var(--surface-card)] p-2',
        onClick && !isFicha && 'transition hover:bg-[color:var(--surface-container-high)]',
        className,
      )}
    >
      <header
        className={cn(
          'mb-3 border-b pb-2 text-center',
          isToday
            ? isFicha
              ? 'border-b-2 border-[color:var(--primary-container)] pb-[7px]'
              : 'border-[color:var(--accent)]'
            : 'border-[color:var(--border-subtle)]',
        )}
      >
        <span
          className={cn(
            'text-[10px] font-bold uppercase tracking-wider',
            isToday ? 'text-[color:var(--primary-container)]' : 'text-[color:var(--text-muted)]',
          )}
        >
          {dayLabel}
          {isToday && isFicha ? ' (Hoy)' : ''}
        </span>
        {dateLabel && !isFicha ? (
          <span className="ml-1 text-[10px] tabular-nums text-[color:var(--text-muted)]">
            {dateLabel}
          </span>
        ) : null}
      </header>

      <div className={cn('flex flex-1 flex-col gap-3', isFicha && 'gap-3')}>{children}</div>

      {onAdd ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="mt-auto pt-1 text-left text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
        >
          + entreno
        </button>
      ) : null}
    </Tag>
  );
}
