import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// LA INSIGNIA — la pastilla que CALIFICA algo (un estado, una categoría, una
// procedencia). No es un control: no se clica, no se filtra con ella, no lleva
// foco. Lo que se toca es un `Button`; lo que se elige es un `SegmentedControl`.
//
// Medido sobre `components/v2` + las páginas de `(v2)` el 15-ago: 98 llamadas a
// `v2/Pill` y ~104 pastillas escritas a mano con el mismo `rounded-[var(--v2-r-pill)]`
// + `px-2 py-0.5`. Esto es la reescritura de `Pill` que pide el plan del design
// system (`docs/design-system-web.html`, ola 2: «los caseros que valen se
// reescriben encima de los de shadcn y se quedan en components/ui/»). `Pill`
// sigue vivo hasta que se migren sus 98 llamadas; no se toca aquí.
//
// EL COLOR ENTRA POR DOS PROPIEDADES, NO POR UNA CLASE POR CASO. `--badge-fg` y
// `--badge-bg` son el único mecanismo: `tone` las rellena con un token semántico
// fijo, y `tint` las rellena con el par de tokens que traiga el DATO. Hace falta
// porque el dashboard tiñe insignias por ejes que NO son el semáforo y que son
// del coach, no nuestros — la modalidad (`MODALITY_META`) y la procedencia del
// ejercicio (`EXERCISE_ORIGIN_META`) ya viajan como nombres de token en tiempo de
// ejecución. Enumerarlos aquí como `tone="carrera"` metería metodología del coach
// dentro de un primitivo (HARD RULE Nº0). Y no siempre son un par del mismo tono:
// `own` es tinte naranja con texto en tinta, a propósito.
const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--v2-r-pill)] ' +
    'bg-[color:var(--badge-bg)] font-semibold text-[color:var(--badge-fg)]',
  {
    variants: {
      // LOS CINCO TONOS SEMÁNTICOS, y son los que tienen token en los DOS temas.
      // Falta `accent` a propósito: el naranja de marca no tiene variante
      // oscurecida para el tema claro (sí la tienen ok/warn/danger/info/mod-*),
      // así que como TEXTO sobre su propio tinte da 2,71:1 — muy por debajo del
      // 4,5:1 de AA. Sólo funciona como RELLENO con `--v2-accent-fg` encima, que
      // es como lo usa el CTA. Y el §9.1 del CONTRATO-UI ya lo dice por otra vía:
      // «el naranja de marca no es un color de dato». Quien necesite el tinte
      // naranja usa `tint` con texto en tinta, como hace `EXERCISE_ORIGIN_META.own`.
      tone: {
        neutral: '[--badge-bg:var(--v2-surface-2)] [--badge-fg:var(--v2-muted)]',
        ok: '[--badge-bg:var(--v2-ok-soft)] [--badge-fg:var(--v2-ok)]',
        warn: '[--badge-bg:var(--v2-warn-soft)] [--badge-fg:var(--v2-warn)]',
        danger: '[--badge-bg:var(--v2-danger-soft)] [--badge-fg:var(--v2-danger)]',
        info: '[--badge-bg:var(--v2-info-soft)] [--badge-fg:var(--v2-info)]',
      },
      // DOS VARIANTES, y son las dos que se usan: de las 98 llamadas a `Pill`,
      // 71 declaran `soft` y 11 `outline`. `solid` lo pide UNA sola (el estado
      // del lead) y no se puede servir bien hoy: necesita un token de «tinta
      // sobre relleno saturado» que el tema no tiene, y reutilizar
      // `--v2-accent-fg` deja `neutral` en 3,47:1 en claro. Es trabajo de la ola
      // de tokens, no de un átomo.
      variant: {
        soft: '',
        outline: 'border border-[color:var(--badge-fg)] bg-transparent',
      },
      // DOS TAMAÑOS, los dos peldaños que ya existen en la escala de tipo.
      // `default` (11px) es la insignia que dice un ESTADO — 34 pastillas a mano.
      // `eyebrow` (10px) es la que dice una CATEGORÍA, y va en mayúsculas porque
      // así está definido el peldaño en `globals.css` («cabecera de sección,
      // MAYÚSCULAS+track») — 14 a mano, 12 de ellas ya en mayúsculas.
      // No hay peldaño `nano`: sus 7 usos son contadores dentro de un avatar o de
      // una miniatura, que es otra pieza (un contador, no una calificación).
      size: {
        default: 'px-2 py-0.5 text-label',
        eyebrow: 'px-2 py-0.5 text-eyebrow font-bold uppercase tracking-[0.04em]',
      },
    },
    defaultVariants: { variant: 'soft', size: 'default' },
  }
);

/** Los dos tokens que tiñen una insignia cuando el color lo manda el DATO.
 *  Se pasan como NOMBRE de custom property (`--v2-mod-ergo`), no como color:
 *  así el valor lo sigue resolviendo el tema y claro/oscuro siguen funcionando. */
export type BadgeTint = { fg: string; bg: string };

type BadgeVariants = VariantProps<typeof badgeVariants>;

// El color viene de UNA fuente: o el semáforo, o el dato. Pedirlos a la vez es
// un error de quien llama, y el tipo lo impide en vez de resolverlo en silencio.
type BadgeColorProps =
  | { tone?: BadgeVariants['tone']; tint?: never }
  | { tone?: never; tint: BadgeTint };

type BadgeProps = React.ComponentProps<'span'> &
  Omit<BadgeVariants, 'tone'> &
  BadgeColorProps;

function Badge({ className, variant, size, tone, tint, style, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone: tint ? undefined : (tone ?? 'neutral'), variant, size }), className)}
      style={
        tint
          ? { ...style, ['--badge-fg' as string]: `var(${tint.fg})`, ['--badge-bg' as string]: `var(${tint.bg})` }
          : style
      }
      {...props}
    />
  );
}

export { Badge, badgeVariants };
export type { BadgeProps };
