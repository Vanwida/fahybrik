import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// LA TARJETA — toda superficie contenedora del dashboard pasa por aquí.
//
// Habla los nombres de token de shadcn (`bg-card`, `border-border`, `bg-muted`)
// igual que el botón, y la FORMA (radio + elevación) la saca de `rounded-card`,
// `rounded-card-inset` y `shadow-card`, que `app/globals.css` declara y
// `(v2)/v2-theme.css` reapunta a la escala del dashboard. Resultado: los mismos
// píxeles que hoy se escriben a mano, en claro y en oscuro, sin un solo valor
// arbitrario en la llamada.
//
// LAS VARIANTES SON TRES PORQUE SON TRES LOS PAPELES QUE EXISTEN — medido sobre
// `components/v2` + las páginas de `(v2)` el 14-ago (`row` se añade el 15-ago):
//
//   panel  · la superficie que se apoya en el lienzo de la página. Lleva
//            elevación, radio grande. 22 pintadas a mano + las 12 que ya
//            importaban `v2/Card` + el cuerpo de `atleta-detalle/parts#Panel`.
//   inset  · el bloque anidado DENTRO de un panel. Un escalón de fondo, radio
//            menor (un anidado nunca redondea más que su contenedor) y sin
//            elevación: dos sombras apiladas no leen como profundidad, leen
//            como suciedad. 59 pintadas a mano — es el contenedor más común.
//   row    · la FILA de una lista ordenable, que se apoya en el lienzo como el
//            panel pero se apila con sus hermanas. Por eso toma el fondo del
//            panel (`bg-card`) y el radio del anidado (12 px): a 3–6 filas
//            seguidas, el radio grande las separa de más y la elevación
//            repetida ensucia. No es `inset` — `bg-muted` es un escalón de
//            fondo que la fila no da, y sobre él el chip de nivel pierde
//            contraste. Es exactamente lo que pintaba a mano `ReorderRow`.
//
// NO lleva padding. El relleno lo pone quien la usa (p-3, p-3.5, p-4, p-5 y
// px-3.5 py-3 conviven hoy y todos son correctos para su contenido): cablearlo
// aquí obligaría a deshacerlo en cada migración.
//
// Tampoco lleva cabecera ni pie. Cuando el dashboard tenga UNA cabecera de
// tarjeta de verdad, se añade aquí; hoy cada sección resuelve la suya y no hay
// un patrón que compartan.
const cardVariants = cva('border text-card-foreground', {
  variants: {
    variant: {
      panel: 'rounded-card border-border bg-card shadow-card',
      inset: 'rounded-card-inset border-border bg-muted',
      row: 'rounded-card-inset border-border bg-card',
    },
    // La tarjeta entera es pulsable (abre un detalle, navega). El borde se tiñe
    // de marca al pasar por encima. Es el gesto que ya hacía `v2/Card`, y se
    // mantiene tal cual para no cambiar las 12 pantallas que lo estrenaron.
    // Va en `color-mix` porque un borde tintado al 40 % no es un token: es un
    // cálculo entre dos que sí lo son.
    interactive: {
      true: 'transition-colors hover:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))]',
      false: '',
    },
  },
  defaultVariants: { variant: 'panel', interactive: false },
});

type CardProps = React.ComponentProps<'div'> & VariantProps<typeof cardVariants>;

function Card({ className, variant, interactive, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ variant, interactive, className }))}
      {...props}
    />
  );
}

export { Card, cardVariants };
export type { CardProps };
