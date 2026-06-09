'use client';

import { useEffect, useId, useRef } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

type DrawerSide = 'left' | 'right';

interface StudioMobileDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Lado de entrada del panel. `left` = librería, `right` = detalle. */
  side?: DrawerSide;
  title: string;
  children: React.ReactNode;
}

/**
 * Drawer móvil/tablet (<lg) para los paneles del studio de programación.
 *
 * En `lg+` el studio mantiene sus 3 paneles fijos; aquí, por debajo, la librería
 * y el panel de detalle pasan a este drawer a pantalla casi completa para que el
 * coach pueda VER y editar sin un panel lateral de 320px inviable en móvil.
 *
 * Accesibilidad: `role="dialog"` + `aria-modal`, label por título, cierre con
 * Escape y click en el backdrop, bloqueo de scroll del body, foco trasladado al
 * panel al abrir y devuelto al disparador al cerrar, y focus-trap con Tab/Shift+Tab
 * acotado al contenido del drawer. Mismo lenguaje visual (dark + borde sutil) que
 * el `CoachMobileNav` y `TemplateEditorDrawer`.
 */
export function StudioMobileDrawer({
  open,
  onClose,
  side = 'right',
  title,
  children,
}: StudioMobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Elemento con foco antes de abrir, para restaurarlo al cerrar.
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    prevFocusRef.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Focus-trap: mantener el Tab dentro del panel.
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex lg:hidden"
    >
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex w-full max-w-[26rem] flex-col outline-none',
          'bg-[color:var(--surface-container-lowest)] shadow-2xl',
          side === 'left'
            ? 'left-0 border-r border-[color:var(--border-subtle)]'
            : 'right-0 border-l border-[color:var(--border-subtle)]',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] px-4">
          <h2 id={titleId} className="font-display text-base font-bold text-[color:var(--fg)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(
              'focus-ring flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)]',
              'text-[color:var(--text-muted)] transition-colors',
              'hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]',
            )}
          >
            <MIcon name="close" size={22} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
