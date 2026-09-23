'use client';

import type { ReactElement, ReactNode } from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '@/lib/utils';
import { Kbd } from './Kbd';
import { OVERLAY_Z, usePanelPortal } from './portal';

export interface TooltipProps {
  /** Texto corto. Nunca información que solo esté aquí. */
  content: ReactNode;
  /** Atajo de teclado que se enseña a la derecha («E», «⌘K»). */
  shortcut?: string;
  /** El disparador: un elemento enfocable (botón, enlace). */
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

/** Proveedor: agrupa los tooltips (el segundo abre sin espera). Lo monta PanelProviders. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delay={450} closeDelay={80}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({ content, shortcut, children, side = 'top', delay }: TooltipProps) {
  const { anchor, container } = usePanelPortal();
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger ref={anchor} render={children} delay={delay} />
      <TooltipPrimitive.Portal container={container}>
        <TooltipPrimitive.Positioner side={side} sideOffset={6} className={OVERLAY_Z}>
          <TooltipPrimitive.Popup
            className={cn(
              'flex items-center gap-2 rounded-ctl px-2 py-1 t-meta',
              'bg-v2-fg text-v2-bg shadow-pop',
              'origin-[var(--transform-origin)] transition-[opacity,scale,translate] duration-100',
              'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              'data-[ending-style]:opacity-0',
            )}
          >
            <span>{content}</span>
            {shortcut ? <Kbd tone="inverse">{shortcut}</Kbd> : null}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
