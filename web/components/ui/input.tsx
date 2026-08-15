import { Input as InputPrimitive } from '@base-ui/react/input';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// EL CAMPO — todo campo de texto de una línea del dashboard pasa por aquí.
//
// Habla los nombres de token de shadcn (`border-input`, `bg-muted`…), no el
// dialecto `--v2-*`, igual que el botón: dentro del dashboard resuelven a los
// valores de v2 por el puente de `(v2)/v2-theme.css`, así que se ve como la
// pantalla en claro y en oscuro. Por eso este fichero no toca ningún CSS: el
// puente que dejó el botón ya nombra todo lo que un campo necesita.
//
// Medido el 14-ago sobre los 133 campos de texto reales de `app/` +
// `components/`: 86 expresiones de clase distintas y OCHO constantes locales
// rivales — `inputCls`, `inputClass`, `FIELD`, `FIELD_CLS`, `INPUT_CLS`,
// `DATE_INPUT_CLS`, `v2FieldCell` y `.ob-field` — cada una en su fichero y
// ninguna al tanto de las otras.
//
// Los valores de abajo no se han elegido: son los que ya escribe a mano la
// mayoría, así que migrar un campo no mueve un píxel.
//   · radio   `rounded-lg`   → --radius → --v2-r-s (8px) — 84 de 133 campos
//   · borde   `border-input` → --v2-border               — 72 de 133
//   · fondo   `bg-muted`     → --v2-surface-2            — 59 de 133
const inputVariants = cva(
  [
    'block min-w-0 rounded-lg border border-input bg-muted text-foreground',
    'outline-none transition-colors',
    // El marcador de posición es el ÚNICO valor que cambia al migrar, y es a
    // mejor: el `--v2-faint` que se escribe hoy a mano da 3,41:1 en oscuro y
    // 2,72:1 en claro sobre el fondo del campo — los dos por debajo del 4,5:1
    // de WCAG AA. `--muted-foreground` da 6,74:1 y 5,21:1.
    'placeholder:text-muted-foreground',
    // Anillo de dos capas (WCAG 2.4.7) — el mismo dibujo que el botón, para que
    // el foco no cambie de forma según el control que tengas debajo del dedo.
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    // Inválido SIN prop nueva: el campo se tiñe leyendo el `aria-invalid` que
    // ya hace falta por accesibilidad. Antes de esto, las pantallas que lo
    // pasaban lo anunciaban al lector de pantalla y no lo enseñaban a nadie más.
    'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
  ],
  {
    variants: {
      // La misma escala de alturas que el botón (h-8 · h-9 · h-10), y a
      // propósito: un campo y un botón en la misma fila se alinean por
      // construcción en vez de por casualidad.
      size: {
        sm: 'h-8 px-2.5 text-xs',
        default: 'h-9 px-3 text-sm',
        lg: 'h-10 px-3 text-sm',
      },
      // La cara monoespaciada de cifra rachada (CONTRATO-UI §10.2, «un solo
      // numeral para toda la app»). Mismas dos reglas que `.v2-num`, en
      // utilidades estándar: `font-mono` resuelve a la misma Geist Mono.
      numeral: { true: 'font-mono tabular-nums', false: '' },
    },
    defaultVariants: { size: 'default' },
  },
);

// Los tipos cuyo contenido ES una cifra. Una columna de fechas o de kilos que
// baila de ancho no se puede comparar de un vistazo, así que el numeral es el
// DEFECTO para ellos y no algo que cada pantalla tenga que acordarse de pedir.
// `numeral` sigue estando para el caso que no se deduce del tipo: un código o
// un enlace son `type="text"` y quieren cifra rachada igual.
const NUMERAL_BY_DEFAULT = new Set([
  'number',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
  'tel',
]);

// Se omite el `size` NATIVO (el ancho en caracteres del HTML de 1995) para que
// el nombre lo tenga la escala compartida con el botón. Verificado: no lo usa
// ni un campo del repo, y el ancho aquí se resuelve con CSS.
type InputProps = Omit<InputPrimitive.Props, 'size'> &
  VariantProps<typeof inputVariants>;

function Input({ className, size, numeral, type = 'text', ...props }: InputProps) {
  return (
    <InputPrimitive
      data-slot="input"
      type={type}
      className={cn(
        inputVariants({
          size,
          numeral: numeral ?? NUMERAL_BY_DEFAULT.has(type),
          className,
        }),
      )}
      {...props}
    />
  );
}

export { Input, inputVariants };
export type { InputProps };
