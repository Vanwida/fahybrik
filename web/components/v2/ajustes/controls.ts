// El cromo compartido de las tarjetas de Ajustes: campo de texto y los tres
// botones. Vive aquí y no dentro de cada tarjeta porque en cuanto Ajustes tuvo
// dos formularios (perfil y avisos de lo que publicas) el mismo «Guardar
// cambios» pasaba a estar escrito dos veces, y dos grafías del mismo botón es
// exactamente lo que se nota al bajar por la página.
//
// Son solo clases: todo sale de los tokens v2, ni un hex ni un tamaño suelto.

import { cn } from '@/lib/utils';

/** Entrada de texto de una tarjeta de Ajustes (una línea o `<textarea>`). */
export const ajustesField = cn(
  'v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]',
  'bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)]',
  'outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]',
);

/** La acción que cierra el formulario: guardar. Una por tarjeta. */
export const ajustesButtonPrimary = cn(
  'v2-focus inline-flex items-center justify-center gap-1.5 rounded-[var(--v2-r-pill)]',
  'bg-[color:var(--v2-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--v2-accent-fg)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

/** Acción de apoyo: subir foto, restaurar los valores por defecto, reintentar. */
export const ajustesButtonSecondary = cn(
  'v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)]',
  'bg-[color:var(--v2-surface)] px-3 py-1.5 text-sm font-semibold text-[color:var(--v2-fg)]',
  'hover:border-[color:var(--v2-border-strong)] disabled:cursor-not-allowed disabled:opacity-50',
);

/** Acción de quitar: sin caja, y en rojo solo al pasar por encima. */
export const ajustesButtonGhost = cn(
  'v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-1.5',
  'text-sm font-medium text-[color:var(--v2-muted)] hover:text-[color:var(--v2-danger)]',
);
