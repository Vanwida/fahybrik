import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

// EL BOTÓN — cualquier acción pulsable del dashboard pasa por aquí.
//
// Habla los nombres de token de shadcn (`bg-primary`, `border-border`…), no el
// dialecto `--v2-*`: son los que reconoce cualquier agente sin que se los
// expliquen, y son los que pide docs/design-system-web.html. Dentro del
// dashboard resuelven a los valores de v2 por el puente de `(v2)/v2-theme.css`,
// así que se ve como la pantalla — en claro y en oscuro.
const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-1.5',
    'whitespace-nowrap rounded-lg border border-transparent font-semibold',
    'outline-none transition-colors',
    // Anillo de dos capas (WCAG 2.4.7): hueco del color del lienzo + aro
    // naranja. Mismo dibujo que `.v2-focus`, con utilidades estándar.
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-accent-press',
        outline: 'border-border text-foreground hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        // Tintado, no macizo: es como se pinta hoy lo destructivo en el
        // dashboard, y deja el rojo macizo para la confirmación de verdad.
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20',
      },
      size: {
        sm: 'h-8 px-2.5 text-xs',
        default: 'h-9 px-4 text-sm',
        lg: 'h-10 px-5 text-sm',
        'icon-sm': 'size-8',
        icon: 'size-9',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    // Acción en curso: saca la ruleta, bloquea el botón y lo anuncia a los
    // lectores de pantalla. La etiqueta se queda, así que el ancho no salta.
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <MIcon name="progress_activity" className="animate-spin text-base" />
      ) : null}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
