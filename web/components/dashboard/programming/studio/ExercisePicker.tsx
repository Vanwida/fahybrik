'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { usePortalMount } from '@/lib/dashboard/programming/use-portal-mount';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

interface ExercisePickerProps {
  exercises: CatalogExercise[];
  onSelect: (exercise: CatalogExercise) => void;
  triggerLabel: string;
  className?: string;
}

interface PopoverRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Picker de ejercicios del catálogo (62) para añadir un ejercicio A MEDIDA a un
// bloque desde el panel de detalle (Fase 3). Popover anclado por portal en body
// (fixed) para escapar del overflow de la columna del panel — mismo patrón que
// AddBlockMenu. Búsqueda incremental + lista densa; ratón > teclado pero
// accesible (combobox + Escape + click-fuera).
export function ExercisePicker({ exercises, onSelect, triggerLabel, className }: ExercisePickerProps) {
  const [open, setOpen] = useState(false);
  const mounted = usePortalMount();
  const [rect, setRect] = useState<PopoverRect | null>(null);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  useLayoutEffect(() => {
    if (!open) return;
    const updateRect = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? exercises.filter(
          (e) => e.name.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q),
        )
      : exercises;
    return [...base].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
  }, [exercises, query]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'focus-ring flex h-9 w-full items-center justify-center gap-1.5 rounded-md',
          'border border-dashed border-[color:var(--border-subtle)]',
          'text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]',
          'transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]',
          open && 'border-[color:var(--accent)] text-[color:var(--accent)]',
        )}
      >
        <MIcon name="add" size={15} />
        <span>{triggerLabel}</span>
      </button>

      {open && mounted && rect
        ? createPortal(
            <div
              ref={popoverRef}
              style={{
                position: 'fixed',
                left: rect.left,
                top: rect.top + rect.height + 4,
                width: Math.max(rect.width, 240),
              }}
              className={cn(
                'z-[60] flex max-h-[60vh] flex-col overflow-hidden',
                'rounded-[var(--r-l)] border border-[color:var(--border-subtle)]',
                'bg-[color:var(--surface-container-highest)] shadow-lg',
              )}
            >
              <div className="border-b border-[color:var(--border-subtle)] p-2">
                <div className="flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-2">
                  <MIcon name="search" size={15} className="text-[color:var(--text-muted)]" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar ejercicio…"
                    aria-label="Buscar ejercicio"
                    className="h-8 w-full bg-transparent text-sm text-[color:var(--fg)] outline-none placeholder:text-[color:var(--text-muted)]"
                  />
                </div>
              </div>

              <div role="listbox" aria-label="Ejercicios" className="overflow-y-auto p-1">
                {filtered.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-[color:var(--text-muted)]">
                    Sin resultados
                  </p>
                ) : (
                  filtered.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        onSelect(ex);
                        close();
                      }}
                      className="focus-ring flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-2 text-left hover:bg-[color:var(--surface-elevated)]"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--fg)]">
                        {ex.name}
                      </span>
                      <span className="shrink-0 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                        {ex.category}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
