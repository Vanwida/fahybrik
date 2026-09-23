'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd } from './Kbd';

/**
 * Barra de acciones en bloque: aparece abajo, centrada, en cuanto hay algo
 * seleccionado. «N seleccionados» + acciones (Buttons `size="sm"`) + limpiar.
 * Escape limpia la selección (si el foco no está en un campo).
 */
export function BulkBar({
  count,
  onClear,
  children,
  noun = ['seleccionado', 'seleccionados'],
  className,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
  /** Singular y plural del recuento. */
  noun?: [string, string];
  className?: string;
}) {
  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      onClear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, onClear]);

  if (count === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Acciones sobre la selección"
      className={cn(
        'fixed left-1/2 z-[80] flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1',
        'rounded-panel border border-v2-border-strong bg-v2-elevated p-1.5 shadow-pop',
        'bottom-[calc(var(--v2-tabbar-h)+12px)] lg:bottom-6',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none',
        className,
      )}
    >
      {/* Recuento y «quitar» siempre a la vista; en el móvil desplazan las acciones. */}
      <button
        type="button"
        onClick={onClear}
        aria-label={`${count} ${count === 1 ? noun[0] : noun[1]} · quitar selección`}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-ctl pr-2 pl-1.5 text-v2-muted outline-none hover:bg-v2-hover hover:text-v2-fg focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
      >
        <X aria-hidden className="size-3.5" strokeWidth={2} />
        <span className="t-body font-semibold whitespace-nowrap text-v2-fg t-tnum">
          {count} {count === 1 ? noun[0] : noun[1]}
        </span>
        <Kbd className="hidden sm:inline-flex">Esc</Kbd>
      </button>
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-v2-border" />
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">{children}</div>
    </div>
  );
}
