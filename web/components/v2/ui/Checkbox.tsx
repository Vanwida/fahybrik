'use client';

import type { MouseEvent, ReactNode } from 'react';
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps {
  checked: boolean;
  /** Estado mixto (cabecera de tabla con parte seleccionada). */
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean, event?: Event) => void;
  /** Texto visible a la derecha. Sin él, `aria-label` es obligatorio. */
  label?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
  /** Para el shift-clic de las tablas: el evento de ratón llega aquí. */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  id?: string;
}

/** Casilla 16 px. Marcada = relleno tinta (neutro), nunca el acento del club. */
export function Checkbox({
  checked,
  indeterminate,
  onCheckedChange,
  label,
  disabled,
  className,
  onClick,
  id,
  ...aria
}: CheckboxProps) {
  const box = (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={(next, details) => onCheckedChange(next, details.event)}
      onClick={onClick}
      disabled={disabled}
      aria-label={label ? undefined : aria['aria-label']}
      className={cn(
        'relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-v2-border-strong bg-v2-surface',
        'outline-none transition-colors duration-[var(--v2-dur-fast)] hover:border-v2-muted',
        'focus-visible:shadow-[0_0_0_2px_var(--v2-bg),0_0_0_4px_var(--v2-accent)]',
        'data-[checked]:border-v2-fg data-[checked]:bg-v2-fg data-[indeterminate]:border-v2-fg data-[indeterminate]:bg-v2-fg',
        'data-[disabled]:opacity-45',
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5 pointer-coarse:after:content-['']",
        !label && className,
      )}
    >
      <CheckboxPrimitive.Indicator className="flex text-v2-bg">
        {indeterminate ? (
          <Minus className="size-3" strokeWidth={3} aria-hidden />
        ) : (
          <Check className="size-3" strokeWidth={3} aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  if (!label) return box;
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 t-body text-v2-fg', disabled && 'opacity-60', className)}>
      {box}
      <span>{label}</span>
    </label>
  );
}

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/** Interruptor para ajustes que se aplican al momento. */
export function Switch({ checked, onCheckedChange, label, disabled, className, id, ...aria }: SwitchProps) {
  const control = (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      disabled={disabled}
      aria-label={label ? undefined : aria['aria-label']}
      className={cn(
        'relative inline-flex h-5 w-8 shrink-0 items-center rounded-full border border-v2-border-strong bg-v2-surface-2 p-0.5',
        'outline-none transition-colors duration-[var(--v2-dur)]',
        'focus-visible:shadow-[0_0_0_2px_var(--v2-bg),0_0_0_4px_var(--v2-accent)]',
        'data-[checked]:border-v2-fg data-[checked]:bg-v2-fg data-[disabled]:opacity-45',
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-3 pointer-coarse:after:content-['']",
        !label && className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block size-3.5 rounded-full bg-v2-muted shadow-sm transition-transform duration-[var(--v2-dur)] ease-[var(--v2-ease)]',
          'data-[checked]:translate-x-3 data-[checked]:bg-v2-bg',
        )}
      />
    </SwitchPrimitive.Root>
  );
  if (!label) return control;
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 t-body text-v2-fg', disabled && 'opacity-60', className)}>
      {control}
      <span>{label}</span>
    </label>
  );
}
