'use client';

// La línea de estado bajo la rejilla: qué está seleccionado y las teclas que
// valen para ello. Solo con puntero fino (en táctil no hay teclado).

import { Kbd } from '@/components/v2/ui';
import { DAY_LABELS_FULL } from '@/lib/dashboard/v2/planes-model';
import { rangeSize, type GridPos, type GridRange } from '@/lib/dashboard/programming/grid-model';
import { useModKey } from './mod-key';

export function ShortcutBar({ cursor, range }: { cursor: GridPos; range: GridRange | null }) {
  const mod = useModKey();
  const cells = range ? rangeSize(range).cells : 0;
  const what = range
    ? `${range.r0 === range.r1 ? `Semana ${range.r0 + 1}` : `Semanas ${range.r0 + 1}–${range.r1 + 1}`} · ${cells} ${cells === 1 ? 'día' : 'días'}`
    : `Semana ${cursor.row + 1} · ${DAY_LABELS_FULL[cursor.col]}`;
  const keys: Array<[string, string]> = range
    ? [[mod('C'), 'copiar'], [mod('V'), 'pegar'], [mod('D'), 'duplicar abajo'], ['Supr', 'vaciar'], [mod('Z'), 'deshacer']]
    : [['↵', 'escribir'], [mod('↵'), 'detalle'], ['⇧ flechas', 'seleccionar'], [mod('C'), 'copiar'], [mod('V'), 'pegar'], [mod('Z'), 'deshacer']];
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
