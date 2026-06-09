import { cn } from '@/lib/utils';

interface FilterChipProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Nodo previo al label (p.ej. el punto de color del grupo metodológico). */
  leading?: React.ReactNode;
  className?: string;
}

export function FilterChip({
  label,
  active,
  disabled,
  onClick,
  leading,
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'focus-ring rounded-[var(--r-pill)] border px-3.5 py-1.5 text-xs font-semibold transition',
        'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)]',
        'hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))] hover:text-[color:var(--fg)]',
        'disabled:opacity-60',
        leading != null && 'inline-flex items-center gap-1.5',
        active &&
          'border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface-card))]',
        className,
      )}
    >
      {leading}
      {label}
    </button>
  );
}
