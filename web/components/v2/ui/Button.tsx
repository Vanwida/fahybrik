'use client';

import { forwardRef, type ReactNode } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

// EL BOTÓN del panel. Rectángulo de 6 px (las pastillas son solo FilterChip).
// primary = la ÚNICA acción principal de la vista (lleva el acento del club);
// secondary = el resto; ghost = acciones de fila / terciarias; destructive =
// solo la confirmación de algo que se borra.
//
// Tamaños: sm 28 (dentro de filas) · md 32 (barras) · lg 40 (formularios,
// primario de página). En pantallas táctiles el área de toque crece a 44 px sin
// cambiar el dibujo (`::after`).

export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap',
    'rounded-ctl border font-medium outline-none',
    'transition-[background-color,border-color,color,box-shadow] duration-[var(--v2-dur-fast)]',
    'focus-visible:shadow-[0_0_0_2px_var(--v2-bg),0_0_0_4px_var(--v2-accent)]',
    'disabled:pointer-events-none disabled:opacity-45 data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
    "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:min-w-11 pointer-coarse:after:-translate-y-1/2 pointer-coarse:after:content-['']",
    '[&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-v2-accent text-v2-accent-fg font-semibold hover:bg-v2-accent-press',
        secondary:
          'border-v2-border-strong bg-v2-surface text-v2-fg hover:bg-v2-surface-2 hover:border-v2-border-strong',
        ghost: 'border-transparent bg-transparent text-v2-muted hover:bg-v2-hover hover:text-v2-fg',
        destructive:
          'border-transparent bg-v2-danger text-v2-danger-fg font-semibold hover:brightness-110',
      },
      size: {
        sm: 'h-7 px-2.5 text-[13px] [&_svg]:size-3.5',
        md: 'h-8 px-3 text-[13px] [&_svg]:size-4',
        lg: 'h-10 px-4 text-sm [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export type ButtonProps = Omit<ButtonPrimitive.Props, 'className'> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    /** Acción en curso: ruleta, bloqueado, anunciado. El ancho no salta. */
    loading?: boolean;
    /** Icono delante de la etiqueta (componente de Lucide). */
    icon?: LucideIcon;
    /** Icono detrás (p. ej. ChevronDown en un disparador de menú). */
    iconEnd?: LucideIcon;
    children?: ReactNode;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading = false, disabled, icon: Icon, iconEnd: IconEnd, children, type, ...props },
  ref,
) {
  return (
    <ButtonPrimitive
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="animate-spin" strokeWidth={2} aria-hidden />
      ) : Icon ? (
        <Icon strokeWidth={1.75} aria-hidden />
      ) : null}
      {children}
      {IconEnd ? <IconEnd strokeWidth={1.75} aria-hidden className="-mr-0.5 opacity-70" /> : null}
    </ButtonPrimitive>
  );
});

export type IconButtonProps = Omit<ButtonProps, 'icon' | 'iconEnd' | 'children' | 'aria-label'> & {
  icon: LucideIcon;
  /** Obligatorio: es el nombre accesible Y el tooltip. */
  label: string;
  shortcut?: string;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
};

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: 'w-7 px-0',
  md: 'w-8 px-0',
  lg: 'w-10 px-0',
};

/** Botón solo-icono. El tooltip es obligatorio (su `label`). Por defecto ghost. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, shortcut, tooltipSide, variant = 'ghost', size = 'md', className, loading, ...props },
  ref,
) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      <Button
        ref={ref}
        aria-label={label}
        variant={variant}
        size={size}
        loading={loading}
        className={cn(ICON_SIZE[size ?? 'md'], className)}
        {...props}
      >
        {loading ? null : <Icon strokeWidth={1.75} aria-hidden />}
      </Button>
    </Tooltip>
  );
});
