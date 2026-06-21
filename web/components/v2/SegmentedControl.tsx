'use client';

// SegmentedControl — a small pill-grouped single-select (view toggles, filters).
// Controlled: caller owns `value`. Keyboard + focus-visible accessible. The
// active segment fills with the accent; the rest stay quiet.

import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-[var(--v2-r-pill)] p-0.5',
        'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'v2-focus rounded-[var(--v2-r-pill)] font-semibold transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              active
                ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
