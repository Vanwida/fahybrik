'use client';

import { useCallback } from 'react';

import { MIcon } from '@/components/ui/MIcon';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// LA FILA DE LISTA — la fila compacta y reordenable de una lista corta. Nace de
// `v2/periodizacion/ReorderRow`, que servía a Niveles y a Tests desde carpetas
// que no son de nadie: un átomo compartido no puede vivir dentro de una sección.
// Aquí conserva sus píxeles (superficie de `Card variant="row"`, 12 px de radio,
// acciones de 28 px) y gana lo que le faltaba para ser un átomo de verdad: el
// estado completo, el contenedor semántico y una aritmética de reordenación que
// se puede probar sin DOM.
//
// LA REORDENACIÓN VIAJA EN PASOS ADYACENTES, no en un salto. `onMove(index,
// delta)` es la API que ya existía y se conserva tal cual porque es la que
// pueden servir sus dos consumidores: ambos INTERCAMBIAN dos vecinas y
// persisten exactamente esas dos filas (`NivelesPanel` hace PATCH del
// `sort_order` de las dos que se movieron). Un `(from, to)` arbitrario les
// obligaría a recalcular y reescribir todo el tramo, que es justo lo que hoy no
// hacen. Arrastrar tres posiciones emite tres pasos; arrastrar a la vecina
// emite UNO.
//
// LOS DOS CAMINOS SON DELIBERADOS: arrastrar es el gesto premium, y las flechas
// ↑/↓ son las que funcionan con teclado y con el dedo. Las listas son de 3–6
// filas, así que caben las dos sin ruido.

/** El tipo MIME del arrastre. Lo escribe `onDragStart` y lo lee `onDrop`. */
const DRAG_PAYLOAD_TYPE = 'text/plain';

/** Un paso de reordenación: mover la fila `index` una posición en `delta`. */
export type ReorderStep = readonly [index: number, delta: -1 | 1];

/**
 * Traduce un arrastre `from → to` a los pasos adyacentes que lo componen.
 *
 * Devuelve una lista VACÍA cuando el movimiento no existe o no es de fiar:
 * misma fila, índice fuera de la lista, o carga corrupta. El `dataTransfer` es
 * un canal de texto abierto — cualquier arrastre de la página (una selección,
 * un enlace, otra app) llega aquí con su propio `text/plain`, así que la carga
 * se valida en vez de confiarse: `Number.parseInt` convertiría `"12 atletas"`
 * en 12 y movería una fila que nadie pidió mover.
 */
export function reorderSteps(rawFrom: unknown, to: number, total: number): ReorderStep[] {
  const from = typeof rawFrom === 'string' ? parseDragIndex(rawFrom) : rawFrom;
  if (typeof from !== 'number' || !Number.isInteger(from)) return [];
  if (!Number.isInteger(to) || !Number.isInteger(total)) return [];
  // Fuera de la lista no hay fila que mover — ni el origen ni el destino.
  if (from < 0 || from >= total) return [];
  if (to < 0 || to >= total) return [];
  if (from === to) return [];

  const delta: -1 | 1 = from < to ? 1 : -1;
  const steps: ReorderStep[] = [];
  for (let cur = from; cur !== to; cur += delta) steps.push([cur, delta]);
  return steps;
}

/**
 * Lee el índice de la carga del arrastre. Sólo un entero en decimal y a solas
 * cuenta: `parseInt` acepta prefijos («3px», «1.9») y eso es exactamente lo que
 * aquí no se quiere.
 */
export function parseDragIndex(raw: string): number | null {
  if (!/^-?\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) ? n : null;
}

/** ¿Puede esta fila moverse en esa dirección? Falso en los extremos. */
export function canMove(index: number, delta: -1 | 1, total: number): boolean {
  return reorderSteps(index, index + delta, total).length > 0;
}

/**
 * El contenedor de la lista. Existe para que la fila sea un `<li>` de verdad:
 * un `<li>` suelto no es HTML válido y los lectores de pantalla dejan de
 * anunciar «lista de 5 elementos, elemento 2». El `gap` vive aquí, una sola
 * vez, en vez de repetirse en cada pantalla.
 *
 * Sólo admite filas. Lo que acompaña a la lista (una tira explicativa, un pie)
 * va FUERA, como hermano — meterlo dentro del `<ul>` rompería el mismo HTML que
 * este contenedor viene a arreglar.
 */
export function ListRowGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ul className={cn('flex flex-col gap-2', className)}>{children}</ul>;
}

export function ListRow({
  index,
  total,
  onMove,
  selected = false,
  disabled = false,
  danger = false,
  leadingRail,
  children,
  actions,
  className,
}: {
  index: number;
  total: number;
  /** Mueve esta fila de `index` a `index + delta` (delta = -1 | +1). */
  onMove: (index: number, delta: -1 | 1) => void;
  /** Resaltada — la fila que se está editando. */
  selected?: boolean;
  /**
   * Apagada: sin arrastre, sin flechas y sin acciones. El CUERPO sigue
   * legible y anunciable a propósito (una fila apagada se lee, no se toca);
   * lo que el cuerpo contenga es de quien lo pasa.
   */
  disabled?: boolean;
  /** La fila señalada en rojo (pendiente de borrado, en conflicto). */
  danger?: boolean;
  /** Raíl de color a la izquierda (el papel de la fase); un color CSS. */
  leadingRail?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const canUp = !disabled && canMove(index, -1, total);
  const canDown = !disabled && canMove(index, 1, total);

  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_PAYLOAD_TYPE, String(index));
      e.dataTransfer.effectAllowed = 'move';
    },
    [index],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const steps = reorderSteps(e.dataTransfer.getData(DRAG_PAYLOAD_TYPE), index, total);
      for (const [from, delta] of steps) onMove(from, delta);
    },
    [index, total, onMove],
  );

  return (
    <li
      data-slot="list-row"
      data-selected={selected || undefined}
      // Sin `aria-disabled`: el rol implícito de un `<li>` es `listitem` y no lo
      // admite — apagar se dice en los CONTROLES (las flechas van `disabled`,
      // las acciones van `inert`), porque una fila no es un control.
      data-disabled={disabled || undefined}
      draggable={!disabled}
      onDragStart={disabled ? undefined : onDragStart}
      onDragOver={disabled ? undefined : onDragOver}
      onDrop={disabled ? undefined : onDrop}
      className={cn(
        cardVariants({ variant: 'row' }),
        'relative flex items-center gap-3.5 px-3.5 py-3 transition-colors',
        // El borde es el que dice el estado, y sólo puede decir uno: el peligro
        // pisa a la selección (una fila que va a desaparecer importa más que
        // una que se está editando).
        danger
          ? 'border-destructive'
          : selected
            ? 'border-primary'
            : 'hover:border-[color:var(--v2-border-strong)] focus-within:border-[color:var(--v2-border-strong)]',
        disabled && 'opacity-50',
        leadingRail ? 'pl-[18px]' : undefined,
        className,
      )}
    >
      {/* raíl de color (sólo fases) */}
      {leadingRail ? (
        <span
          aria-hidden
          className="absolute bottom-2 left-0 top-2 w-1 rounded-r-[3px]"
          style={{ background: leadingRail }}
        />
      ) : null}

      {/* asa de arrastre */}
      <span
        className={cn(
          'shrink-0 select-none text-[color:var(--v2-faint)]',
          disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing',
        )}
        title={disabled ? undefined : 'Arrastra para reordenar'}
        aria-hidden
      >
        <MIcon name="drag_indicator" size={18} />
      </span>

      {/* flechas (teclado / dedo) */}
      <div className="flex shrink-0 flex-col gap-0.5">
        <ListRowArrow direction="up" enabled={canUp} onClick={() => onMove(index, -1)} />
        <ListRowArrow direction="down" enabled={canDown} onClick={() => onMove(index, 1)} />
      </div>

      <div className="min-w-0 flex-1">{children}</div>

      {actions ? (
        <div
          className="flex shrink-0 items-center gap-2"
          // `inert` apaga puntero, teclado y árbol de accesibilidad de una vez;
          // no se puede desactivar un `ReactNode` que llega de fuera.
          inert={disabled || undefined}
        >
          {actions}
        </div>
      ) : null}
    </li>
  );
}

/** Una de las dos flechas de reordenación. Apagada en el extremo de la lista. */
function ListRowArrow({
  direction,
  enabled,
  onClick,
}: {
  direction: 'up' | 'down';
  enabled: boolean;
  onClick: () => void;
}) {
  const isUp = direction === 'up';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label={isUp ? 'Subir' : 'Bajar'}
      className={cn(
        'v2-focus flex h-[15px] w-[22px] items-center justify-center rounded-[var(--v2-r-2xs)] border border-border text-[color:var(--v2-faint)] transition-colors',
        enabled
          ? 'hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]'
          : 'cursor-not-allowed opacity-30',
      )}
    >
      <MIcon name={isUp ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} size={14} />
    </button>
  );
}

/**
 * La acción de una fila: un cuadrado de 28 px que sólo lleva icono, así que
 * SIEMPRE lleva `aria-label` — sin él es un botón mudo. No es una variante de
 * `Button` a propósito: `Button` no tiene ningún tamaño cuadrado de 28 px con
 * este borde, y añadírselo por dos llamadas metería en el átomo general una
 * forma que sólo usa la fila.
 */
export function ListRowAction({
  icon,
  label,
  onClick,
  danger = false,
  disabled = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'v2-focus flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] border border-border text-[color:var(--v2-muted)] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        danger
          ? 'hover:border-destructive hover:text-destructive'
          : 'hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
      )}
    >
      <MIcon name={icon} size={15} />
    </button>
  );
}
