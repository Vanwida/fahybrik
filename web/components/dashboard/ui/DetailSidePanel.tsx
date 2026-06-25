'use client';

// DetailSidePanel — a NON-modal slide-over (SPEC §2/§4: "detalle en panel
// lateral no-modal — la cola sigue visible"). Crucial difference from a dialog:
// it does NOT trap focus and does NOT render a blocking scrim, so the triage
// queue behind it stays fully visible and interactive. It DOES manage focus
// politely: on open it moves focus into the panel; Esc (or the close button)
// closes it and returns focus to the element that opened it (SPEC §9
// "side-panel gestiona foco — Esc devuelve a origen").
//
// Controlled: parent owns `open` + `onClose`. Pass the trigger ref (or rely on
// document.activeElement at open time) so focus can return on close.

import { useEffect, useRef } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export interface DetailSidePanelProps {
  open: boolean;
  onClose: () => void;
  /** Accessible panel title (rendered in the header + aria-label). */
  title: string;
  /** Optional eyebrow/kicker above the title. */
  eyebrow?: string;
  /** Header action slot (e.g. "Ver ficha ↗"). */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  /** Panel width. Default 'md' (28rem). */
  width?: 'sm' | 'md' | 'lg';
  className?: string;
}

const WIDTH_CLASS = {
  sm: 'w-[22rem]',
  md: 'w-[28rem]',
  lg: 'w-[34rem]',
} as const;

export function DetailSidePanel({
  open,
  onClose,
  title,
  eyebrow,
  headerAction,
  children,
  width = 'md',
  className,
}: DetailSidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Remember the element that had focus when the panel opened, to restore it.
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = (document.activeElement as HTMLElement) ?? null;
      // Move focus into the panel (heading) without trapping — the queue stays
      // reachable by Tab/Shift+Tab because we never cycle focus.
      requestAnimationFrame(() => {
        panelRef.current?.focus();
      });
    } else if (triggerRef.current) {
      // Restore focus to the opener on close (SPEC §9).
      triggerRef.current.focus?.();
      triggerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <aside
      // Non-modal: NO role="dialog"/aria-modal, NO scrim. It is a complementary
      // region that animates in from the right edge. Hidden from a11y tree +
      // tab order when closed.
      aria-label={title}
      aria-hidden={!open}
      className={cn(
        'fixed right-0 top-0 z-50 flex h-dvh flex-col',
        'border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]',
        'shadow-[var(--shadow-modal)] transition-transform duration-200 ease-out motion-reduce:transition-none',
        WIDTH_CLASS[width],
        'max-w-[92vw]',
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        className,
      )}
    >
      <header className="flex items-start gap-3 border-b border-[color:var(--border-subtle)] px-5 py-4">
        <div
          ref={panelRef}
          tabIndex={-1}
          className="min-w-0 flex-1 outline-none"
        >
          {eyebrow ? <p className="micro-label mb-1">{eyebrow}</p> : null}
          <h2 className="truncate text-base font-semibold text-[color:var(--fg)]">{title}</h2>
        </div>
        {headerAction}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-m)] text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--fg)]"
        >
          <MIcon name="close" size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
    </aside>
  );
}
