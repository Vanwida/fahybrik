// Eyebrow label — a small orange tick + uppercase tracked text. Server component.
// The tick is the ONLY orange-as-meaning exception allowed here: it's the brand mark,
// not data viz.

import { cn } from '@/lib/utils';

interface SectionLabelProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
}

export function SectionLabel({ children, id, className }: SectionLabelProps) {
  return (
    <span
      id={id}
      className={cn(
        'inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[color:var(--muted)]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="size-[6px] rounded-[1px] bg-[color:var(--accent)]"
      />
      {children}
    </span>
  );
}
