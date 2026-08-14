'use client';

// EL DESPLEGABLE — elegir UN valor de una lista cerrada.
//
// Mismo patrón que el botón (#3/#4) y el campo (#6): un primitivo de
// `@base-ui/react` vestido con `cva`, hablando los nombres de token de shadcn
// (`border-input`, `bg-muted`, `bg-popover`…) y no el dialecto `--v2-*`. Dentro
// del dashboard resuelven a los valores de v2 por el PUENTE de
// `(v2)/v2-theme.css`, así que se ve como la pantalla en claro y en oscuro. Por
// eso este fichero NO toca ningún CSS.
//
// ── Por qué un componente y no una constante de clases ──────────────────────
// La caja cerrada de un `<select>` nativo ya se puede vestir: es un elemento
// normal. Lo que NO se puede vestir es la LISTA ABIERTA — la pinta el navegador
// con el cromo del sistema operativo. Y aquí ni siquiera `color-scheme` sirve de
// parche: el dashboard lleva DOS temas sobre el mismo `<html>`
// (`.v2-root[data-theme="dark|light"]`, con aislamiento duro — los tokens nunca
// suben a `<html>`), así que el coach pulsa el toggle a claro y la lista seguiría
// saliendo del tema del sistema. Hoy los 26 desplegables del dashboard abren una
// lista que no se parece a la app. Ese es el único defecto que un componente
// arregla y una constante de clases no, y es por lo que la ola 2 de
// `docs/design-system-web.html` trae un Select.
//
// ── El modelo: qué es «elegir uno de una lista» aquí ────────────────────────
// Medido el 14-ago sobre los 26 `<select>` reales de `app/` + `components/`:
//
//   · 0 con `multiple`             → SIEMPRE un valor, nunca varios
//   · 0 con `<option disabled>`    → …pero es gratis y es del dominio: se acepta
//   · 1 con `<optgroup>`           → TestEditorPanel («Calibra» / «Solo guardar
//                                     el número»). Uno basta: si el modelo no
//                                     tiene grupos, esa pantalla se queda fuera
//                                     para siempre y acaba con su propio
//                                     desplegable a mano, que es de donde
//                                     venimos.
//   · 9 con opción vacía de marcador («Elegir atleta…», «Día: toda la semana»)
//   · 42 `<option>` escritos a mano; el resto salen de un `.map()` sobre datos
//
// De ahí la API: `items` es una lista plana de `{ value, label }` O una lista de
// grupos `{ label, items }`. Nada más, y nada menos.
//
// ── Por qué `items` y no los hijos compuestos de shadcn ─────────────────────
// Base UI necesita `items` sí o sí para que el DISPARADOR muestre la etiqueta y
// no el valor en crudo: sin él, `<Select.Value>` serializa el valor y en pantalla
// sale el UUID del atleta. Con la API compuesta habría que escribir la lista dos
// veces — una en `items` y otra en los hijos `<SelectItem>` — y dos fuentes para
// una lista es exactamente el bug que este componente existe para no tener.

import { useRef } from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { cva, type VariantProps } from 'class-variance-authority';

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

// El ÁMBITO DEL TEMA. Los tokens del dashboard viven en `.v2-root[data-theme]` y
// NUNCA suben a `<html>` — es el aislamiento duro que deja convivir el rediseño
// con la app antigua. Una lista que se va al portal sale de ese elemento, así que
// deja de leer el tema y cae a los valores sólo-oscuro de `app/globals.css`: en
// claro salía una lista NEGRA sobre el tablero claro. Se vio en la comprobación
// visual del 14-ago, no en el typecheck.
//
// Por eso el portal no va al `<body>` sino al ámbito de tema más cercano. Fuera
// del dashboard (la app antigua, /admin) no hay ninguno y se cae al `<body>`,
// que es exactamente lo que esas pantallas ya hacen.
const THEME_SCOPE_SELECTOR = '.v2-root';

const selectTriggerVariants = cva(
  [
    // Mismo lienzo que un campo de texto: un desplegable y un campo en el mismo
    // formulario tienen que ser el MISMO objeto, no dos primos. Los 26 de hoy se
    // reparten `--v2-border` (5) y `--v2-border-strong` (6) sin criterio; el
    // empate lo rompe el campo, que es con quien comparten fila.
    'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-muted',
    'text-left text-foreground outline-none transition-colors select-none',
    // Sin valor elegido, el disparador enseña el marcador — y en gris de
    // marcador: `--muted-foreground` da 6,74:1 en oscuro y 5,21:1 en claro,
    // mientras que el `--v2-faint` que se escribe hoy a mano se queda en 3,41:1 y
    // 2,72:1, los dos por debajo del 4,5:1 de WCAG AA.
    'data-[placeholder]:text-muted-foreground',
    // El foco dibuja lo MISMO que `.v2-focus` de `(v2)/v2-theme.css`
    // (`0 0 0 2px var(--v2-bg), 0 0 0 4px var(--v2-accent)`), en utilidades
    // estándar. Con la lista abierta el disparador se queda marcado: sigue siendo
    // el ancla de lo que está pasando en pantalla.
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'data-[popup-open]:border-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    // Inválido SIN prop nueva: se tiñe leyendo el `aria-invalid` que ya hace
    // falta por accesibilidad.
    'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
  ],
  {
    variants: {
      // La MISMA escala de alturas que el botón y el campo (h-8 · h-9 · h-10), a
      // propósito: un desplegable y un botón en la misma fila se alinean por
      // construcción y no por casualidad. Hoy hay cuatro alturas para una sola
      // cosa (30, 34, 38 y 40px) más los que sólo llevan `py-*`, ninguna elegida.
      size: {
        sm: 'h-8 px-2.5 text-xs',
        default: 'h-9 px-3 text-sm',
        lg: 'h-10 px-3 text-sm',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

/** Una opción. `label` es texto plano porque es lo que enseña el disparador. */
export type SelectOption<Value> = {
  value: Value;
  label: string;
  disabled?: boolean;
};

/** Un grupo con cabecera, para las listas que mezclan dos familias de opción. */
export type SelectOptionGroup<Value> = {
  label: string;
  items: ReadonlyArray<SelectOption<Value>>;
};

type SelectItems<Value> =
  | ReadonlyArray<SelectOption<Value>>
  | ReadonlyArray<SelectOptionGroup<Value>>;

function isGrouped<Value>(items: SelectItems<Value>): items is ReadonlyArray<SelectOptionGroup<Value>> {
  return items.length > 0 && 'items' in items[0];
}

type SelectProps<Value> = Omit<
  SelectPrimitive.Trigger.Props,
  'children' | 'value' | 'defaultValue' | 'onChange' | 'disabled'
> &
  VariantProps<typeof selectTriggerVariants> & {
    items: SelectItems<Value>;
    /**
     * `null` = nada elegido → sale el marcador. Si la lista trae una opción con
     * `value: null` y etiqueta (p. ej. «toda la semana»), gana esa etiqueta: no
     * elegir nada PUEDE ser una elección, y entonces se puede volver a ella.
     */
    value: Value | null;
    onValueChange: (value: Value) => void;
    placeholder?: string;
    /** Identifica el campo al enviar un formulario (Base UI pone el input oculto). */
    name?: string;
    required?: boolean;
    disabled?: boolean;
  };

function SelectOptionItem<Value>({ option }: { option: SelectOption<Value> }) {
  return (
    <SelectPrimitive.Item
      value={option.value}
      disabled={option.disabled}
      className={cn(
        // El texto de la lista NO encoge con el disparador: elegir es el momento
        // de leer. Un disparador denso abre una lista legible, que es justo lo
        // que hace un desplegable nativo.
        'relative flex cursor-pointer items-center rounded-[min(var(--radius),6px)] py-1.5 pr-2 pl-7',
        'text-sm text-foreground outline-none select-none',
        'data-[highlighted]:bg-muted',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      )}
    >
      {/* El check va en absoluto para que la fila elegida no se desplace: la
          lista tiene que quedarse quieta mientras se recorre con el teclado. */}
      <SelectPrimitive.ItemIndicator className="absolute left-1.5 flex items-center text-primary">
        <MIcon name="check" size={16} />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="truncate">{option.label}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function Select<Value>({
  items,
  value,
  onValueChange,
  placeholder,
  size,
  name,
  required,
  disabled,
  className,
  ...triggerProps
}: SelectProps<Value>) {
  // Se resuelve en el ref del disparador (no en un efecto con estado) para que el
  // portal ya tenga destino la primera vez que se abre, sin un render de más.
  const themeScopeRef = useRef<HTMLElement | null>(null);

  return (
    <SelectPrimitive.Root
      items={items as ReadonlyArray<{ label: string; value: Value }>}
      value={value}
      onValueChange={(next) => onValueChange(next as Value)}
      name={name}
      required={required}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        data-slot="select-trigger"
        ref={(el) => {
          themeScopeRef.current = el?.closest<HTMLElement>(THEME_SCOPE_SELECTOR) ?? null;
        }}
        className={cn(selectTriggerVariants({ size, className }))}
        {...triggerProps}
      >
        <SelectPrimitive.Value className="truncate" placeholder={placeholder} />
        <SelectPrimitive.Icon className="flex shrink-0 items-center text-muted-foreground transition-transform duration-150 in-data-[popup-open]:rotate-180 motion-reduce:transition-none">
          <MIcon name="expand_more" size={18} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal container={themeScopeRef}>
        {/* La lista sale al portal, o sea FUERA de la pila del modal que la
            contenga. Los modales del dashboard están escritos a mano con
            `fixed inset-0 z-*` y el más alto es `z-[80]`; 90 es el primer peldaño
            que garantiza que un desplegable abierto dentro de CUALQUIERA de ellos
            se pinta encima y no detrás. */}
        <SelectPrimitive.Positioner
          className="z-[90]"
          sideOffset={6}
          // Base UI por defecto solapa la lista sobre el disparador para alinear
          // el elegido con el valor (el gesto de macOS). En un panel denso eso
          // tapa la fila de al lado; aquí la lista cuelga DEBAJO, que es lo que ya
          // hace el menú de cuenta y lo que espera cualquiera en un tablero.
          alignItemWithTrigger={false}
        >
          <SelectPrimitive.Popup
            data-slot="select-popup"
            className={cn(
              // El ancho arranca en el del disparador y crece si un nombre largo
              // lo pide, sin pasarse del hueco que queda en pantalla.
              'min-w-[var(--anchor-width)] max-w-[min(var(--available-width),22rem)]',
              // Con 100+ atletas la lista no cabe: se limita a lo que hay de alto
              // y hace scroll dentro, sin arrastrar la página de detrás.
              'max-h-[min(var(--available-height),20rem)] overflow-y-auto overscroll-contain',
              // `--v2-shadow-pop` es el token de sombra de superficie flotante del
              // dashboard (el mismo que usa el menú de cuenta). Se lee en crudo
              // porque el puente de shadcn no le da nombre, y bautizarlo
              // significaría tocar `(v2)/v2-theme.css`.
              'rounded-[var(--v2-r-m)] border border-border bg-popover p-1 text-popover-foreground shadow-[var(--v2-shadow-pop)]',
              'origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 motion-reduce:transition-none',
              'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            )}
          >
            <SelectPrimitive.List>
              {isGrouped(items)
                ? items.map((group) => (
                    <SelectPrimitive.Group key={group.label} className="not-first:mt-1">
                      <SelectPrimitive.GroupLabel className="px-2 py-1 text-label font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                        {group.label}
                      </SelectPrimitive.GroupLabel>
                      {group.items.map((option) => (
                        <SelectOptionItem key={String(option.value)} option={option} />
                      ))}
                    </SelectPrimitive.Group>
                  ))
                : items.map((option) => (
                    <SelectOptionItem key={String(option.value)} option={option} />
                  ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export { Select, selectTriggerVariants };
