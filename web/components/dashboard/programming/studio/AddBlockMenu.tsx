'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GROUPED_PART_PRESETS } from '@/lib/dashboard/constants/week-day-part-presets';
import { usePortalMount } from '@/lib/dashboard/programming/use-portal-mount';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

interface AddBlockMenuProps {
  /** Abre la Biblioteca de Pablo (vía principal). */
  onLibrary: () => void;
  /** Dispara el flujo Pablo IA para este día. */
  onPabloIA: () => void;
  /** Crea un bloque a medida con el formato elegido (presetId). */
  onCustom: (presetId: string) => void;
  className?: string;
}

interface PopoverRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type View = 'sources' | 'custom';

// Un SOLO verbo "Añadir bloque" con 3 fuentes (fricción F4). Sustituye las 3
// vías solapadas previas (presets de formato sueltos / picker de biblioteca /
// arrastrar ejercicios) por una sola puerta:
//   1. Biblioteca de Pablo — la vía normal (los ~97 bloques).
//   2. Que proponga Pablo IA — compone el día desde bloques.
//   3. A medida — bloque vacío con el formato elegido; los ejercicios se meten
//      DENTRO del bloque (no sueltos).
// Popover anclado por portal en body (fixed) para evitar el clipping de los
// ancestros con overflow (columnas día + scroll list). Mismo patrón que el
// antiguo AddPartMenu.
export function AddBlockMenu({ onLibrary, onPabloIA, onCustom, className }: AddBlockMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('sources');
  const mounted = usePortalMount();
  const [rect, setRect] = useState<PopoverRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setView('sources');
  };

  // Posición del popover anclada al botón.
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

  // Click fuera + Escape.
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

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'focus-ring flex h-9 w-full items-center justify-center gap-1.5 rounded-md',
          'border border-dashed border-[color:var(--border-subtle)]',
          'text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]',
          'transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]',
          open && 'border-[color:var(--accent)] text-[color:var(--accent)]',
        )}
      >
        <MIcon name="add" size={15} />
        <span>Añadir bloque</span>
      </button>

      {open && mounted && rect
        ? createPortal(
            <div
              ref={popoverRef}
              role="menu"
              aria-label="Añadir bloque"
              style={{
                position: 'fixed',
                left: rect.left,
                top: rect.top + rect.height + 4,
                minWidth: Math.max(rect.width, 240),
              }}
              className={cn(
                'z-[60] max-h-[70vh] w-60 overflow-y-auto',
                'rounded-[var(--r-l)] border border-[color:var(--border-subtle)]',
                'bg-[color:var(--surface-container-highest)] p-1 shadow-lg',
              )}
            >
              {view === 'sources' ? (
                <>
                  <SourceRow
                    icon="library_books"
                    title="De biblioteca de Pablo"
                    hint="Los bloques de Pablo · vía habitual"
                    onClick={() => {
                      onLibrary();
                      close();
                    }}
                  />
                  <SourceRow
                    iconNode={
                      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="8" cy="8" r="2.2" fill="currentColor" />
                      </svg>
                    }
                    title="Que proponga Pablo IA"
                    hint="Compone el día desde bloques"
                    accent
                    onClick={() => {
                      onPabloIA();
                      close();
                    }}
                  />
                  <SourceRow
                    icon="tune"
                    title="Crear a medida"
                    hint="Bloque vacío · elige el formato"
                    trailing={<MIcon name="chevron_right" size={16} />}
                    onClick={() => setView('custom')}
                  />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setView('sources')}
                    className="focus-ring mb-1 flex w-full items-center gap-1 rounded-[var(--r-sm)] px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
                  >
                    <MIcon name="chevron_left" size={16} />
                    <span>Formato del bloque</span>
                  </button>
                  {GROUPED_PART_PRESETS.map((group, groupIndex) => (
                    <div key={group.label} className={cn(groupIndex > 0 && 'mt-1')}>
                      <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                        {group.label}
                      </p>
                      {group.presets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onCustom(preset.id);
                            close();
                          }}
                          className="focus-ring flex w-full items-start gap-2 rounded-[var(--r-sm)] px-2 py-2 text-left hover:bg-[color:var(--surface-elevated)]"
                        >
                          <span className="text-base leading-none">{preset.emoji}</span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[color:var(--fg)]">
                              {preset.title}
                            </span>
                            <span className="block text-[10px] text-[color:var(--text-muted)]">
                              {preset.hint}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function SourceRow({
  icon,
  iconNode,
  title,
  hint,
  trailing,
  accent,
  onClick,
}: {
  icon?: string;
  iconNode?: React.ReactNode;
  title: string;
  hint: string;
  trailing?: React.ReactNode;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="focus-ring flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2 py-2.5 text-left hover:bg-[color:var(--surface-elevated)]"
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)]',
          accent
            ? 'bg-[color:var(--accent)]/12 text-[color:var(--accent)]'
            : 'bg-[color:var(--surface-container-high)] text-[color:var(--text-muted)]',
        )}
      >
        {iconNode ?? (icon ? <MIcon name={icon} size={17} /> : null)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[color:var(--fg)]">{title}</span>
        <span className="block text-[10px] text-[color:var(--text-muted)]">{hint}</span>
      </span>
      {trailing ? (
        <span className="shrink-0 text-[color:var(--text-muted)]">{trailing}</span>
      ) : null}
    </button>
  );
}
