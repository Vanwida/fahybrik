'use client';

// La línea de estado bajo la rejilla: qué está seleccionado y las teclas que
// valen para ello. Solo con puntero fino (en táctil no hay teclado).

import { Kbd } from '@/components/v2/ui';
import { DAY_LABELS_FULL } from '@/lib/dashboard/v2/planes-model';
import { rangeSize, type GridPos, type GridRange } from '@/lib/dashboard/programming/grid-model';

export function ShortcutBar({ cursor, range }: { cursor: GridPos; range: GridRange | null }) {
  const what = range
    ? `${range.r0 === range.r1 ? `Semana ${range.r0 + 1}` : `Semanas ${range.r0 + 1}–${range.r1 + 1}`} · ${rangeSize(range).cells} días`
    : `Semana ${cursor.row + 1} · ${DAY_LABELS_FULL[cursor.col]}`;
  const keys: Array<[string, string]> = range
    ? [['⌘C', 'copiar'], ['⌘V', 'pegar'], ['⌘D', 'duplicar abajo'], ['Supr', 'vaciar'], ['⌘Z', 'deshacer']]
    : [['↵', 'escribir'], ['⌘↵', 'detalle'], ['⇧ flechas', 'seleccionar'], ['⌘C', 'copiar'], ['⌘V', 'pegar'], ['⌘Z', 'deshacer']];
  return (
    <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 t-meta text-v2-faint pointer-fine:flex">
      <span className="font-medium text-v2-muted">{what}</span>
      {keys.map(([k, label]) => (
        <span key={k} className="flex items-center gap-1.5">
          <Kbd>{k}</Kbd>
          {label}
        </span>
      ))}
    </div>
  );
}
