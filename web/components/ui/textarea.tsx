'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { useId } from 'react';

import { cn } from '@/lib/utils';

// EL CAMPO DE VARIAS LÍNEAS — toda nota, bio, mensaje y pegado del dashboard
// pasa por aquí.
//
// Habla los nombres de token de shadcn (`border-input`, `bg-muted`…), no el
// dialecto `--v2-*`, igual que el botón (#3/#4) y el campo (#6): dentro del
// dashboard resuelven a los valores de v2 por el puente de `(v2)/v2-theme.css`,
// así que se ve como la pantalla en claro y en oscuro. Por eso este fichero
// **no toca ningún CSS**: el puente que dejó el botón ya nombra todo lo que
// hace falta (`--input`, `--muted`, `--muted-foreground`, `--radius`, `--ring`,
// `--background`, `--destructive`).
//
// Medido el 15-ago sobre los 22 `<textarea>` reales de `components/v2` (fuera
// quedan los 4 del doble y el del onboarding: son otra superficie, con su
// propia hoja de estilos). El lienzo no se ha elegido, se ha contado:
//   · `resize-y`          21 de 22
//   · `leading-relaxed`   15 de 22 (3 `leading-snug`, 4 sin declarar)
//   · `px-3 py-2 text-sm` el reparto modal de relleno y tamaño
//   · monoespaciado        0 de 22 — una nota es prosa, no cifra
//
// Y ocho constantes de clase rivales resolviendo lo mismo sin saber unas de
// otras: `TEXTAREA_CLS`, `v2NoteCell`, `BASE_ENTRADA`, `FIELD`, `FIELD_CLS`,
// `inputCls`, `INPUT_CLS` y el pegado a mano de `ImportSourceForm`.
//
// NO usa el primitivo de Base UI a propósito: `@base-ui/react` 1.4.1 no publica
// `textarea`, y su `Input` está tipado `BaseUIComponentProps<'input'>`, así que
// `render={<textarea />}` deja fuera `rows` y compañía. Es un elemento nativo.
const textareaVariants = cva(
  [
    'block w-full min-w-0 rounded-lg border border-input bg-muted text-foreground',
    'resize-y px-3 py-2 text-sm',
    'outline-none transition-colors',
    // El marcador de posición es el único color que cambia al migrar, y es a
    // mejor: el `--v2-faint` que se escribe hoy a mano da 3,41:1 en oscuro y
    // 2,72:1 en claro sobre el fondo del campo — los dos por debajo del 4,5:1
    // de WCAG AA. `--muted-foreground` da 6,74:1 y 5,21:1.
    'placeholder:text-muted-foreground',
    // Anillo de dos capas (WCAG 2.4.7) — el mismo dibujo que `.v2-focus`, que
    // es `box-shadow: 0 0 0 2px var(--v2-bg), 0 0 0 4px var(--v2-accent)`: el
    // desplazamiento va en el color del lienzo y el anillo en el de marca. Por
    // el puente (`--ring` → `--v2-accent`, `--background` → `--v2-bg`) sale el
    // mismo píxel, escrito en el vocabulario del kit en vez del de v2.
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    // Inválido SIN prop nueva: el campo se tiñe leyendo el `aria-invalid` que
    // ya hace falta por accesibilidad. Mismo trato que en el botón y el campo.
    'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
  ],
  {
    variants: {
      // El interlineado ES el eje del campo de varias líneas: una nota que el
      // coach escribe y relee quiere aire entre renglones; un pegado donde cada
      // renglón es un registro (el plan de `ImportSourceForm`, la pauta de
      // `ExerciseEditForm`) quiere verse como un bloque y no como prosa.
      interlineado: {
        prosa: 'leading-relaxed',
        compacta: 'leading-snug',
      },
    },
    defaultVariants: { interlineado: 'prosa' },
  },
);

type TextareaBaseProps = Omit<React.ComponentProps<'textarea'>, 'children'> &
  VariantProps<typeof textareaVariants>;

// `contador` obliga a `value` y `maxLength` por tipo, no por convención: un
// contador que no sabe cuánto se ha escrito pintaría 0 en silencio para
// siempre. Los 22 campos medidos son controlados, así que no se pierde ninguno.
type TextareaProps =
  | (TextareaBaseProps & { contador?: false })
  | (TextareaBaseProps & { contador: true; value: string; maxLength: number });

/**
 * El campo de varias líneas del dashboard.
 *
 * `contador` es la razón de que esto sea un componente y no una constante de
 * clases. Medido el 15-ago: **16 de los 22** campos llevan `maxLength` y solo
 * **3 sitios de todo el repo** pintan el gasto — con **dos grafías distintas**
 * del mismo dato (`120/2000` en el perfil del coach y en los consejos,
 * `120 / 2000` en el intake). Los **13 restantes dejan de aceptar letras sin
 * decir nada**, que es la peor manera de encontrarse un límite. Aquí hay una
 * sola grafía, va atada al campo por `aria-describedby` (el lector de pantalla
 * canta el límite al entrar, no al chocarse) y se tiñe al llegar al tope.
 */
function Textarea(props: TextareaProps) {
  const generado = useId();
  const { className, interlineado, contador, ...resto } = props;
  const idContador = `${props.id ?? generado}-limite`;

  const campo = (
    <textarea
      data-slot="textarea"
      {...resto}
      // Después del spread a propósito: se SUMA al que traiga la pantalla, no
      // lo pisa.
      aria-describedby={
        contador
          ? [props['aria-describedby'], idContador].filter(Boolean).join(' ')
          : props['aria-describedby']
      }
      className={cn(textareaVariants({ interlineado }), className)}
    />
  );

  if (!props.contador) return campo;

  // `.length` cuenta unidades de código UTF-16, que es exactamente lo que mide
  // el `maxlength` del navegador. NO cambiar a `[...value].length`: contaría un
  // emoji como uno y el campo seguiría cortándolo en dos, así que el contador
  // diría que queda sitio cuando ya no queda.
  const escritos = props.value.length;
  const limite = props.maxLength;
  const lleno = escritos >= limite;

  return (
    <div className="flex flex-col gap-1">
      {campo}
      <span
        id={idContador}
        className={cn(
          'self-end font-mono text-label tabular-nums',
          lleno ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {/* Una sola expresión por nodo, no tres pegadas: React intercala un
            `<!-- -->` entre expresiones hermanas al renderizar en el servidor, y
            eso mete nodos de comentario dentro del dato que se lee. */}
        <span aria-hidden>{`${escritos}/${limite}`}</span>
        {/* Lo que se ve es un ratio; lo que se oye tiene que ser una frase. */}
        <span className="sr-only">
          {`${escritos} de ${limite} caracteres${lleno ? ', límite alcanzado' : ''}`}
        </span>
      </span>
    </div>
  );
}

export { Textarea, textareaVariants };
export type { TextareaProps };
