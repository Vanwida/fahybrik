import { cn } from '@/lib/utils';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', className }: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'focus-ring w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)]',
          'bg-[color:var(--surface-card)] py-2 pl-9 pr-3 text-sm text-[color:var(--fg)]',
          'placeholder:text-[color:var(--text-muted)]',
          'focus:border-[color:var(--accent)] focus:outline-none',
        )}
      />
    </div>
  );
}
