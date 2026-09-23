'use client';

import type { ReactElement, ReactNode } from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd } from './Kbd';
import { OVERLAY_Z, usePanelPortal } from './portal';
import { OPTION_GROUP_LABEL, OPTION_ROW, POPUP_SURFACE } from './styles';

export type MenuEntry =
  | {
      type?: 'item';
      label: string;
      icon?: LucideIcon;
      onSelect: () => void;
      /** Atajo que se enseña (no se cablea aquí). */
      shortcut?: string;
      /** Marca de elegido (menús de opción: «Posponer ▾ 1 d / 3 d»). */
      checked?: boolean;
      /** Solo para borrar/quitar: texto en rojo. */
      danger?: boolean;
      disabled?: boolean;
    }
  | { type: 'separator' }
  | { type: 'label'; label: string };

/**
 * Menú de acciones (···, «Posponer ▾», «+ Nuevo»). Flechas, letra inicial,
 * Enter y Escape de Base UI. `trigger` es el botón que lo abre.
 */
export function Menu({
  trigger,
  items,
  side = 'bottom',
  align = 'end',
  width = 'min-w-48',
}: {
  trigger: ReactElement;
  items: MenuEntry[];
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  width?: string;
}) {
  const { anchor, container } = usePanelPortal();
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger ref={anchor} render={trigger} />
      <MenuPrimitive.Portal container={container}>
        <MenuPrimitive.Positioner side={side} align={align} sideOffset={4} className={OVERLAY_Z}>
          <MenuPrimitive.Popup className={cn(POPUP_SURFACE, 'max-h-[var(--available-height)] overflow-y-auto p-1', width)}>
            {items.map((entry, i) => {
              if (entry.type === 'separator') {
                return <MenuPrimitive.Separator key={`sep-${i}`} className="my-1 h-px bg-v2-border" />;
              }
              if (entry.type === 'label') {
                return (
                  <div key={`lab-${i}`} className={OPTION_GROUP_LABEL}>
                    {entry.label}
                  </div>
                );
              }
              const Icon = entry.icon;
              return (
                <MenuPrimitive.Item
                  key={entry.label}
                  onClick={entry.onSelect}
                  disabled={entry.disabled}
                  className={cn(OPTION_ROW, entry.danger && 'text-v2-danger [&>svg]:text-v2-danger')}
                >
                  {Icon ? <Icon aria-hidden strokeWidth={1.75} /> : null}
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.checked ? <Check aria-hidden strokeWidth={2} className="!size-3.5 !text-v2-fg" /> : null}
                  {entry.shortcut ? <Kbd>{entry.shortcut}</Kbd> : null}
                </MenuPrimitive.Item>
              );
            })}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

/**
 * Popover: contenido libre anclado a un disparador (un filtro con varias
 * casillas, un mini-formulario). Controlado opcional.
 */
export function Popover({
  trigger,
  children,
  title,
  open,
  onOpenChange,
  side = 'bottom',
  align = 'start',
  className,
}: {
  trigger: ReactElement;
  children: ReactNode;
  title?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  const { anchor, container } = usePanelPortal();
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}>
      <PopoverPrimitive.Trigger ref={anchor} render={trigger} />
      <PopoverPrimitive.Portal container={container}>
        <PopoverPrimitive.Positioner side={side} align={align} sideOffset={6} className={OVERLAY_Z}>
          <PopoverPrimitive.Popup className={cn(POPUP_SURFACE, 'w-72 max-w-[var(--available-width)] p-3', className)}>
            {title ? <PopoverPrimitive.Title className="mb-2 t-label text-v2-faint">{title}</PopoverPrimitive.Title> : null}
            {children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
