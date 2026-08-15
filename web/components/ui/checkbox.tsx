'use client';

import { useId, type ReactNode } from 'react';
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// LA CASILLA — todo lo que se marca o se desmarca en el dashboard pasa por aquí.
//
// Habla los nombres de token de shadcn (`border-input`, `bg-primary`, `ring`…),
// no el dialecto `--v2-*`, igual que el botón y el campo: dentro del dashboard
// resuelven a los valores de v2 por el puente de `(v2)/v2-theme.css`, así que
// este fichero no toca ni una línea de CSS y el puente no necesita un token más.
//
// Medido el 15-ago sobre las 6 casillas reales del repo (5 ficheros): las tres
// superficies escriben el mismo control en tres dialectos —`--accent` en admin,
// `--v2-accent` en el dashboard, `.ob-check` en el funnel— y las cinco del lado
// React lo hacen con un `<input type="checkbox">` nativo teñido con
// `accent-color`.
//
// Por qué eso no se ve como la pantalla, que es el motivo de que exista el
// átomo: `accent-color` tiñe SOLO el relleno de la casilla MARCADA. La caja
// desmarcada la sigue pintando el navegador con su propio estilo, y en este
// repo `color-scheme` no está declarado en ningún sitio (verificado en
// `globals.css` y en `v2-theme.css`), así que el navegador la dibuja con su
// esquema claro: caja blanca de borde gris sobre el lienzo oscuro. El estado
// más frecuente de una casilla —desmarcada— es justo el que hoy no obedece al
// tema, ni al claro ni al oscuro.
const checkboxVariants = cva(
  [
    // La caja: 16 px, que es lo que ya miden las cinco del repo (`h-4 w-4`).
    // No hay escala de tamaños de CAJA porque no hay un solo caso real que pida
    // otro: inventarla sería generalizar sin evidencia.
    'peer inline-flex size-4 shrink-0 items-center justify-center',
    // `rounded-sm` cae en 4,8 px dentro del dashboard (--radius → --v2-r-s =
    // 8 px, × 0,6). El peldaño que el sistema de tokens ya llama «casilla» es
    // `--v2-r-2xs: 4px`: 0,8 px de diferencia sobre un lado de 16, invisible. Se
    // escoge el nombre de shadcn y no `--v2-r-2xs` porque un `--v2-*` no existe
    // fuera de `.v2-root` y allí el radio se caería a 0 (esquina viva).
    'rounded-sm border border-input bg-muted',
    'transition-colors outline-none',
    // Marcada e indeterminada se pintan IGUAL: las dos dicen «esto no está
    // vacío». Distinguirlas es trabajo del glifo, no del color.
    'data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground',
    'data-[indeterminate]:border-primary data-[indeterminate]:bg-primary data-[indeterminate]:text-primary-foreground',
    // Anillo de dos capas (WCAG 2.4.7) — el mismo dibujo que el botón y el
    // campo, para que el foco no cambie de forma según el control que tengas
    // debajo del dedo.
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    // Inválido SIN prop nueva: se lee el `aria-invalid` que ya hace falta por
    // accesibilidad. Mismo trato que el campo, y es lo que necesita un
    // consentimiento obligatorio para poder ENSEÑAR que falta marcarlo, en vez
    // de sólo anunciarlo al lector de pantalla.
    'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
  ],
  {
    variants: {
      // La casilla se alinea con la PRIMERA línea del texto, no con su centro,
      // cuando el texto ocupa más de una línea. Los dos casos son reales y
      // conviven en el mismo fichero (`LeadAltaControl`), así que el eje existe.
      align: { center: '', start: 'mt-0.5' },
    },
    defaultVariants: { align: 'center' },
  },
);

// El peldaño de tipo de la etiqueta. Los DOS valores están escritos hoy a mano y
// los dos son de la escala (§9.1: ni un `text-[Npx]` nuevo): `text-sm` en el
// formulario de carreras, `text-xs` en las filas densas del dashboard. Es una
// lista cerrada de dos, no un `labelClassName` abierto — un hueco por el que se
// cuela cualquier cosa es como vuelve la divergencia que el átomo viene a cerrar.
const labelVariants = cva('cursor-pointer font-semibold text-foreground', {
  variants: { size: { default: 'text-sm', dense: 'text-xs' } },
  defaultVariants: { size: 'default' },
});

// El glifo. Va en `currentColor` para que lo tiña la caja y no una segunda regla
// de color, y con trazo 2,5 porque a 10 px un trazo de 2 se deshace.
function TickGlyph({ indeterminate }: { indeterminate: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-2.5"
      aria-hidden="true"
    >
      {indeterminate ? <path d="M3.5 8h9" /> : <path d="M3.5 8.5l3 3 6-6.5" />}
    </svg>
  );
}

type CheckboxProps = Omit<CheckboxPrimitive.Root.Props, 'className'> &
  VariantProps<typeof checkboxVariants> &
  VariantProps<typeof labelVariants> & {
    /**
     * El texto de la casilla. Es `ReactNode` y no `string` a propósito: de las
     * casillas reales del repo, dos llevan marcado dentro (un `<b>` con el
     * importe, un enlace a la política de privacidad). El `Checkbox` local de
     * `RaceFormModal` tipa `label: string`, y por eso no podía dar servicio a
     * ninguna de las dos.
     */
    label?: ReactNode;
    /** La segunda línea, apagada. Cuando la hay, la caja sube a la primera línea. */
    hint?: ReactNode;
    /** Clases de la FILA (caja + texto). La caja se apunta con `boxClassName`. */
    className?: string;
    boxClassName?: string;
  };

function Checkbox({
  className,
  boxClassName,
  align,
  size,
  label,
  hint,
  indeterminate = false,
  disabled,
  id,
  ...props
}: CheckboxProps) {
  const reactId = useId();
  const inputId = id ?? `${reactId}-input`;
  const labelId = `${reactId}-label`;
  const hintId = `${reactId}-hint`;

  // Sin hint, la caja se centra con la etiqueta; con hint, el bloque de texto
  // pasa de una línea y la caja sube a la primera. Se deduce en vez de pedirse
  // porque el componente ya sabe si tiene hint; `align` queda para el caso que
  // NO se deduce: una etiqueta larga sin hint que envuelve a dos líneas.
  const resolvedAlign = align ?? (hint ? 'start' : 'center');

  const box = (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      id={inputId}
      indeterminate={indeterminate}
      disabled={disabled}
      className={cn(
        checkboxVariants({ align: label ? resolvedAlign : 'center' }),
        !label && className,
        boxClassName,
      )}
      // El control accesible es el `<span role="checkbox">` que pinta Base UI;
      // el `<input>` que deja al lado va `aria-hidden` y sólo existe para que el
      // formulario y el clic en el texto funcionen como en una nativa.
      // Por eso el nombre NO puede venir de un `<label for>`: apuntaría al input
      // escondido y el control se anunciaría SIN NOMBRE. Se apunta desde aquí al
      // texto que ya está en pantalla. (Verificado sobre el HTML que renderiza
      // Base UI, no sobre su documentación.)
      {...(label ? { 'aria-labelledby': labelId } : null)}
      {...(hint ? { 'aria-describedby': hintId } : null)}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <TickGlyph indeterminate={indeterminate} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  // Sin texto, la casilla es sólo la casilla: la fila de una tabla que se
  // selecciona no quiere ninguna envoltura. Quien la use así le debe un
  // `aria-label`, porque no hay texto en pantalla al que apuntar.
  if (!label) return box;

  return (
    <div
      data-slot="checkbox-field"
      className={cn(
        'flex gap-2.5',
        resolvedAlign === 'start' ? 'items-start' : 'items-center',
        // El apagado va aquí y no con `peer-*`: el hermano de la caja es este
        // bloque de texto, no la etiqueta de dentro, así que un `peer-` sobre la
        // etiqueta no llegaría a casar nunca.
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {box}
      <div className="flex min-w-0 flex-col gap-0.5">
        {/* `htmlFor` apunta al input escondido: es lo que hace que pulsar el
            texto marque la casilla, igual que en una nativa. */}
        <label
          id={labelId}
          htmlFor={inputId}
          className={cn(labelVariants({ size }), disabled && 'cursor-not-allowed')}
        >
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export { Checkbox, checkboxVariants };
export type { CheckboxProps };
