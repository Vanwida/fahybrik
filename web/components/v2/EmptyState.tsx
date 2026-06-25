// EmptyState — a calm, themed placeholder for empty lanes / unbuilt screens.
// Optional icon (Material Symbols name) + title + description + optional action
// slot. Used by Hoy lanes when a bucket is empty and by the placeholder pages.

import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-2 rounded-[var(--v2-r-m)] px-6 py-10 text-center',
        'border border-dashed border-[color:var(--v2-border)]',
        className,
      )}
    >
      {icon ? (
        <span className="mb-1 text-[color:var(--v2-faint)]">
          <MIcon name={icon} size={28} />
        </span>
      ) : null}
      <p className="w-full text-balance text-sm font-semibold text-[color:var(--v2-fg)]">{title}</p>
      {description ? (
        <p className="w-full max-w-[20rem] text-pretty text-xs leading-relaxed text-[color:var(--v2-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
