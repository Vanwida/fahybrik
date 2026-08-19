'use client';

// FilterDropdown — a Pill-styled single-select dropdown for the roster filter
// row ("Estado ▾", "Nivel ▾", "Fase ▾", "ordenar: adherencia ▾"). Closed it reads
// as a chip showing the active option; open it drops a themed menu. Active (non-
// default) selection tints the chip with the accent so applied filters are
// obvious. Keyboard + click-outside + Escape accessible.

import { useEffect, useId, useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

export function FilterDropdown<T extends string>({
  label,
  options,
  value,
  defaultValue,
  onChange,
  align = 'left',
}: {
  /** Static prefix shown before the active option, e.g. "Estado" or "ordenar". */
  label: string;
  options: ReadonlyArray<DropdownOption<T>>;
  value: T;
  /** When value === defaultValue the chip reads as "unset" (quiet, no accent). */
  defaultValue: T;
  onChange: (next: T) => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const active = value !== defaultValue;
  const current = options.find((o) => o.value === value) ?? options[0];

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        className={cn(
          'v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-pill)] px-3 text-label font-semibold whitespace-nowrap transition-colors',
          active
            ? 'border border-[color:var(--v2-accent)] text-[color:var(--v2-accent-text)] bg-[color:var(--v2-accent-soft)]'
            : 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
        )}
      >
        <span>
          {label}
          {active ? `: ${current?.label}` : ''}
        </span>
        <MIcon name={open ? 'expand_less' : 'expand_more'} size={16} />
      </button>

      {open ? (
        <ul
          id={menuId}
          role="listbox"
          className={cn(
            'absolute z-20 mt-1.5 min-w-[10rem] overflow-hidden rounded-[var(--v2-r-m)] py-1',
            'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'v2-focus flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors',
                    selected
                      ? 'text-[color:var(--v2-fg)] font-semibold'
                      : 'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]',
                  )}
                >
                  <span>{opt.label}</span>
                  {selected ? (
                    <MIcon name="check" size={15} className="text-[color:var(--v2-accent-text)]" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
