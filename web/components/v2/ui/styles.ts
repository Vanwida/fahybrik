// Clases compartidas por todo lo que flota y por las filas de lista. Una sola
// definición: menú, select, combobox y popover se ven iguales.

/** Superficie flotante: borde, 10 px, la única sombra del sistema. */
export const POPUP_SURFACE = [
  'rounded-panel border border-v2-border bg-v2-elevated text-v2-fg shadow-pop outline-none',
  'origin-[var(--transform-origin)] transition-[opacity,scale,translate] duration-[var(--v2-dur-fast)]',
  'data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0',
  'data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0',
  'motion-reduce:transition-none',
].join(' ');

/** Fila de opción dentro de un menú / lista (32 px, resalte neutro). */
export const OPTION_ROW = [
  'relative flex h-8 cursor-default select-none items-center gap-2 rounded-[5px] px-2',
  'text-[13px] text-v2-fg outline-none',
  'data-[highlighted]:bg-v2-select',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
  '[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-v2-muted',
].join(' ');

/** Cabecera de grupo dentro de una lista flotante. */
export const OPTION_GROUP_LABEL = 'px-2 pb-1 pt-2 t-label text-v2-faint';
