'use client';

import type { ReactElement, ReactNode } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from './Button';
import { OVERLAY_Z, usePanelPortal } from './portal';

// Diálogo y panel lateral sobre Base UI Dialog: foco atrapado (modal), Escape
// cierra, el foco vuelve al disparador. Montan dentro de `.v2-root` (tokens).

const DIALOG_W = { sm: 'max-w-[400px]', md: 'max-w-[520px]', lg: 'max-w-[720px]' } as const;

interface OverlayBase {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Acciones al pie (Cancelar · Confirmar). La primaria va la última. */
  footer?: ReactNode;
  /** Elemento que abre (opcional si el estado lo gobierna la pantalla). */
  trigger?: ReactElement;
}

function Backdrop() {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        'fixed inset-0 bg-v2-scrim transition-opacity duration-[var(--v2-dur)]',
        'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        OVERLAY_Z,
      )}
    />
  );
}

function Header({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0 flex-1 pt-1">
        <DialogPrimitive.Title className="t-title-sm text-v2-fg">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 t-body-sm text-v2-muted">{description}</DialogPrimitive.Description>
        ) : null}
      </div>
      <div className="-mr-2 flex shrink-0 items-center gap-1">
        {actions}
        <DialogPrimitive.Close render={<IconButton icon={X} label="Cerrar" shortcut="Esc" />} />
      </div>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-v2-border px-5 py-3">{children}</div>
  );
}

/** Diálogo centrado: confirmaciones y formularios cortos. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  trigger,
  size = 'md',
}: OverlayBase & { size?: keyof typeof DIALOG_W }) {
  const { anchor, container } = usePanelPortal();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      {trigger ? <DialogPrimitive.Trigger ref={anchor} render={trigger} /> : <span ref={anchor} hidden />}
      <DialogPrimitive.Portal container={container}>
        <Backdrop />
        <DialogPrimitive.Popup
          className={cn(
            'fixed top-1/2 left-1/2 flex max-h-[min(85dvh,760px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-panel border border-v2-border bg-v2-elevated text-v2-fg shadow-pop outline-none',
            'transition-[opacity,scale,translate] duration-[var(--v2-dur)] ease-[var(--v2-ease)]',
            'data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0',
            DIALOG_W[size],
            OVERLAY_Z,
          )}
        >
          <Header title={title} description={description} />
          {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 t-body">{children}</div> : null}
          {footer ? <Footer>{footer}</Footer> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const SHEET_W = { sm: 'sm:w-[380px]', md: 'sm:w-[460px]', lg: 'sm:w-[600px]' } as const;

/**
 * Panel lateral derecho. `modal` (por defecto) atrapa el foco y oscurece;
 * `modal={false}` deja la página viva detrás (el vistazo de un atleta mientras
 * se recorre la lista con J/K): sin fondo, no se cierra al pulsar fuera,
 * Escape sí cierra. En el móvil ocupa todo el ancho.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  trigger,
  actions,
  modal = true,
  size = 'md',
}: OverlayBase & { modal?: boolean; size?: keyof typeof SHEET_W; actions?: ReactNode }) {
  const { anchor, container } = usePanelPortal();
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      modal={modal}
      disablePointerDismissal={!modal}
    >
      {trigger ? <DialogPrimitive.Trigger ref={anchor} render={trigger} /> : <span ref={anchor} hidden />}
      <DialogPrimitive.Portal container={container}>
        {modal ? <Backdrop /> : null}
        <DialogPrimitive.Popup
          // No modal: el foco se queda donde estaba (la fila de la tabla), para
          // que J/K sigan cambiando de atleta con el panel abierto.
          initialFocus={modal ? undefined : false}
          finalFocus={modal ? undefined : false}
          className={cn(
            'fixed inset-y-0 right-0 flex w-full flex-col border-l border-v2-border bg-v2-elevated text-v2-fg outline-none',
            'shadow-pop sm:inset-y-2 sm:right-2 sm:rounded-panel sm:border',
            'transition-[opacity,scale,translate] duration-[var(--v2-dur)] ease-[var(--v2-ease)]',
            'data-[starting-style]:translate-x-6 data-[starting-style]:opacity-0',
            'data-[ending-style]:translate-x-6 data-[ending-style]:opacity-0',
            'motion-reduce:transition-none',
            SHEET_W[size],
            OVERLAY_Z,
          )}
        >
          <div className="border-b border-v2-border">
            <Header title={title} description={description} actions={actions} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 t-body">{children}</div>
          {footer ? <Footer>{footer}</Footer> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
