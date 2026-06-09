import { cn } from '@/lib/utils';

export interface SegmentedTab<T extends string = string> {
  key: T;
  label: string;
}

interface SegmentedTabsProps<T extends string> {
  tabs: ReadonlyArray<SegmentedTab<T>>;
  value: T;
  onChange: (key: T) => void;
  disabled?: boolean;
  className?: string;
}

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  disabled,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(key)}
          className={cn(
            'focus-ring rounded-[var(--r-pill)] border px-3.5 py-1.5 text-xs font-semibold transition',
            'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)]',
            'hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))] hover:text-[color:var(--fg)]',
            'disabled:opacity-60',
            value === key &&
              'border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface-card))]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
