import type { StatusDotVariant } from '@/lib/dashboard/constants/session-status';
import { StatusDot } from '@/components/dashboard/ui/StatusDot';
import { cn } from '@/lib/utils';

interface WorkoutCardProps {
  title: string;
  categoryTag?: string | undefined;
  duration?: number | null | undefined;
  rpe?: number | null | undefined;
  status?: StatusDotVariant | undefined;
  isToday?: boolean | undefined;
  isRest?: boolean | undefined;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
  variant?: 'default' | 'ficha' | undefined;
}

export function WorkoutCard({
  title,
  categoryTag,
  duration,
  rpe,
  status = 'scheduled',
  isToday,
  isRest,
  onClick,
  className,
  variant = 'default',
}: WorkoutCardProps) {
  const isFicha = variant === 'ficha';

  if (isRest) {
    return (
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border border-dashed',
          'border-[color:color-mix(in_srgb,var(--border-subtle)_60%,transparent)] bg-transparent',
          isFicha ? 'min-h-[110px] p-3 opacity-40' : 'p-2 text-[10px]',
          'text-[color:var(--text-muted)]',
          isToday && 'border-[color:var(--primary-container)] opacity-70',
          className,
        )}
      >
        {isFicha ? (
          <>
            <RestIcon />
            <span className="mt-1 text-xs font-bold uppercase">Sin entreno</span>
          </>
        ) : (
          'Sin entreno'
        )}
      </div>
    );
  }

  const Tag = onClick ? 'button' : 'div';
  const completed = status === 'completed';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'relative w-full rounded-lg border text-left transition',
        isFicha
          ? 'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-3 hover:border-[color:var(--surface-variant)]'
          : 'rounded-[var(--r-l)] border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-2',
        onClick && 'hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))]',
        isToday &&
          (isFicha
            ? 'border-[color:var(--primary-container)] shadow-[0_0_15px_color-mix(in_srgb,var(--primary-container)_10%,transparent)]'
            : 'border-[color:var(--accent)]'),
        className,
      )}
    >
      {completed ? (
        <span className="absolute right-2 top-2 text-[color:var(--status-success)]">
          <CheckIcon />
        </span>
      ) : (
        <StatusDot
          variant={status}
          className={cn('absolute right-2 top-2', isToday && status === 'scheduled' && 'animate-pulse')}
        />
      )}
      {categoryTag ? (
        <span
          className={cn(
            'mb-1 block text-[10px] font-bold uppercase tracking-wider',
            isToday ? 'text-[color:var(--primary-container)]' : 'text-[color:var(--text-muted)]',
          )}
        >
          {categoryTag}
        </span>
      ) : null}
      <p
        className={cn(
          'truncate font-semibold leading-tight text-[color:var(--fg)]',
          isFicha ? 'pr-4 text-sm' : 'pr-3 text-[10px]',
        )}
      >
        {title}
      </p>
      {(duration != null || rpe != null) && (
        <div
          className={cn(
            'mt-4 flex items-center justify-between text-[color:var(--text-muted)]',
            isFicha ? 'text-xs' : 'mt-0.5 text-[9px] tabular-nums',
          )}
        >
          {duration != null ? (
            <span className="flex items-center gap-1">
              {isFicha ? <TimerIcon /> : null}
              {duration} min
            </span>
          ) : (
            <span />
          )}
          {rpe != null ? (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px]',
                'bg-[color:var(--surface-container-high)]',
                isToday && 'text-[color:var(--primary-container)]',
              )}
            >
              RPE {rpe}
            </span>
          ) : null}
        </div>
      )}
    </Tag>
  );
}

function RestIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5 11h14v2H5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61 1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
    </svg>
  );
}
