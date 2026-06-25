'use client';

// AddMicrocicloPicker — the modal that lists the coach's microciclos (their
// program_month_templates from the Biblioteca) so one can be appended to the
// sequence. Search by name + a usage hint ("usado en N secuencias"). Picking one
// REFERENCES it (stores month_template_id) — never copies it, so editing the
// microciclo in the Biblioteca updates every sequence that uses it. The chosen
// microciclo is inserted at the END of the chain; ordering is then done by drag.

import { useMemo, useRef, useState, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { V2SequenceMicrociclo } from '@/lib/dashboard/v2/secuencias';

export function AddMicrocicloPicker({
  microciclos,
  usageById,
  onPick,
  onClose,
}: {
  microciclos: V2SequenceMicrociclo[];
  /** month_template_id → how many sequences already use it (across the matrix). */
  usageById: Record<string, number>;
  onPick: (microciclo: V2SequenceMicrociclo) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return microciclos;
    return microciclos.filter((m) => m.name.toLowerCase().includes(q));
  }, [microciclos, query]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/55 p-4 pt-[8vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label="Añadir microciclo a la secuencia"
        onClick={(e) => e.stopPropagation()}
        className="v2-focus flex max-h-[80vh] w-full max-w-[560px] flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-elevated)] p-[18px] shadow-[var(--v2-shadow-pop)]"
      >
        <div className="mb-3.5 flex items-center justify-between">
          <span className="text-sm font-bold text-[color:var(--v2-fg)]">
            Añadir microciclo a la secuencia
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus rounded text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={18} />
          </button>
        </div>

        <div className="mb-3 flex h-[34px] items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5">
          <MIcon name="search" size={16} className="text-[color:var(--v2-faint)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en tu biblioteca de microciclos…"
            autoFocus
            className="h-full flex-1 bg-transparent text-[13px] text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:outline-none"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-4 py-8 text-center text-[13px] text-[color:var(--v2-muted)]">
              {microciclos.length === 0
                ? 'Aún no tienes microciclos en la Biblioteca.'
                : 'Ningún microciclo coincide con la búsqueda.'}
            </div>
          ) : (
            filtered.map((m) => {
              const used = usageById[m.id] ?? 0;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPick(m)}
                  className={cn(
                    'v2-focus flex items-center gap-3 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2.5 text-left',
                    'transition-colors hover:border-[color:var(--v2-accent)]',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-[color:var(--v2-fg)]">{m.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-[color:var(--v2-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <MIcon name="date_range" size={12} className="opacity-70" />
                        <b className="v2-num">{m.week_count}</b> sem
                      </span>
                      <span className="inline-flex items-center gap-1 text-[color:var(--v2-faint)]">
                        <MIcon name="view_week" size={12} className="opacity-70" />
                        {used === 0
                          ? 'sin usar aún'
                          : `usado en ${used} ${used === 1 ? 'secuencia' : 'secuencias'}`}
                      </span>
                    </div>
                  </div>
                  <MIcon name="add" size={18} className="shrink-0 text-[color:var(--v2-accent)]" />
                </button>
              );
            })
          )}
        </div>

        <div className="mt-3.5 flex items-center justify-between border-t border-[color:var(--v2-border)] pt-3">
          <Link
            href="/v2/biblioteca?tab=microciclos"
            className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="add" size={15} /> Crear microciclo nuevo
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="v2-focus inline-flex h-8 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
