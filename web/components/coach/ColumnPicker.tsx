'use client';

import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Check } from 'lucide-react';
import { COLUMN_KEYS, DEFAULT_COLUMNS, type ColumnKey } from '@/lib/coach/types';
import { COLUMN_LABELS, REQUIRED_COLUMNS } from '@/lib/coach/columns';

interface ColumnPickerProps {
  visible: ColumnKey[];
  onChange: (next: ColumnKey[]) => void;
}

export function ColumnPicker({ visible, onChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const set = new Set(visible);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function toggle(key: ColumnKey) {
    if (REQUIRED_COLUMNS.includes(key)) return;
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(COLUMN_KEYS.filter((k) => next.has(k)));
  }

  function reset() {
    onChange([...DEFAULT_COLUMNS]);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 items-center gap-1.5 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2.5 text-xs text-[color:var(--muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
      >
        <SlidersHorizontal className="size-3.5" aria-hidden strokeWidth={1.5} />
        Columnas
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-64 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] p-1 shadow-[var(--shadow-card)]"
        >
          <div className="max-h-80 overflow-auto">
            {COLUMN_KEYS.map((key) => {
              const checked = set.has(key);
              const required = REQUIRED_COLUMNS.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => toggle(key)}
                  disabled={required}
                  className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${
                    required
                      ? 'text-[color:var(--muted)] cursor-not-allowed'
                      : 'text-[color:var(--fg)] hover:bg-[color:var(--surface-elevated)]'
                  }`}
                >
                  <span>{COLUMN_LABELS[key]}</span>
                  {checked && (
                    <Check
                      className="size-3.5 text-[color:var(--accent)]"
                      aria-hidden
                      strokeWidth={2}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="border-t border-[color:var(--hairline)] mt-1 pt-1">
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-sm px-2 py-1.5 text-left text-xs uppercase tracking-[0.16em] text-[color:var(--muted)] hover:text-[color:var(--fg)]"
            >
              restablecer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
