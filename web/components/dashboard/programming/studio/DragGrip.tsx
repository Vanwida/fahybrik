'use client';

import { cn } from '@/lib/utils';

export function DragGrip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 cursor-grab touch-none flex-col gap-0.5 px-0.5 text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)] active:cursor-grabbing',
        className,
      )}
      aria-hidden
    >
      <span className="block h-0.5 w-2.5 rounded bg-current" />
      <span className="block h-0.5 w-2.5 rounded bg-current" />
      <span className="block h-0.5 w-2.5 rounded bg-current" />
    </span>
  );
}
