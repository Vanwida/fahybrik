'use client';

// BlockItemTable — las filas de ejercicios de un bloque, PLANAS (rediseño de
// microciclos, decisión 1): la dosis común del bloque se pinta UNA vez como
// línea-botón mono que abre el compositor, y cada fila lleva su etiqueta A/B/C,
// el nombre y solo su excepción o «hereda N×M». Si los items divergen de verdad,
// cada fila pinta su dosis entera (shared-dose.ts decide, sin mentir agrupando).
// Presentación derivada: el dato guardado no cambia. Tocar cualquier fila (o la
// dosis) abre el compositor lateral; una fila sin ejercicio se marca en rojo y
// el picker del compositor la resuelve — el gate del guardado ya la exige.

import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { itemHasExercise } from '@/lib/dashboard/v2/item-validity';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { blockDoseView, type BlockDoseView } from './shared-dose';

// Etiqueta del botón «añadir» según lo que el bloque contiene (vocabulario de
// box, no jerga): movimiento / ejercicio / componente / tramo.
function addLabelFor(block: EditorBlock): string {
  const m = block.items[0]?.prescription.modality;
  if (m === 'strength') return 'añadir ejercicio';
  if (m === 'run') return 'añadir tramo';
  if (m === 'core' || m === 'mobility') return 'añadir movimiento';
  return 'añadir componente';
}

// Etiqueta A/B/C… de una fila (más allá de la Z, el número de orden).
function rowTag(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

export function BlockItemTable({
  block,
  onEditItem,
  onAddItem,
  onMoveItem,
}: {
  block: EditorBlock;
  onEditItem: (uid: string) => void;
  onAddItem: () => void;
  onMoveItem: (uid: string, dir: -1 | 1) => void;
}) {
  const dose = blockDoseView(block);
  const count = block.items.length;
  const firstUid = block.items[0]?.uid;

  return (
    <div className="space-y-1.5">
      {/* La dosis común / el marco del formato, UNA vez — botón que abre el
          compositor. Sin dosis utilizable: aviso ámbar, nunca un cero inventado. */}
      {firstUid && (dose.kind === 'shared' || dose.kind === 'frame') ? (
        <button
          type="button"
          onClick={() => onEditItem(firstUid)}
          className="v2-focus inline-flex max-w-full items-center gap-2.5 rounded-[var(--v2-r-s)] border border-transparent bg-[color:var(--v2-surface-2)] px-3 py-1.5 text-left transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          <span className="v2-micro shrink-0">
            {dose.kind === 'shared' ? 'Dosis común' : 'Formato'}
          </span>
          <span className="v2-num min-w-0 truncate text-body font-semibold text-[color:var(--v2-fg)]">
            {dose.label}
          </span>
          <span className="shrink-0 text-label text-[color:var(--v2-faint)]">editar</span>
        </button>
      ) : null}
      {firstUid && dose.kind === 'undosed' ? (
        <button
          type="button"
          onClick={() => onEditItem(firstUid)}
          className="v2-focus inline-flex items-center gap-2 rounded-[var(--v2-r-s)] bg-[color:var(--v2-warn-soft)] px-3 py-1.5 text-left text-xs font-semibold text-[color:var(--v2-warn)] transition-colors"
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--v2-warn)]"
          />
          sin dosis · tócala y escríbela
        </button>
      ) : null}

      {count === 0 ? (
        <p className="px-1 py-1.5 text-xs text-[color:var(--v2-muted)]">
          Sin ejercicios todavía.
        </p>
      ) : (
        <div>
          {block.items.map((it, i) => (
            <ItemRow
              key={it.uid}
              item={it}
              index={i}
              count={count}
              rx={rowRx(dose, i, count)}
              onEdit={() => onEditItem(it.uid)}
              onMove={(dir) => onMoveItem(it.uid, dir)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAddItem}
        className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
      >
        <MIcon name="add" size={14} />
        {addLabelFor(block)}
      </button>
    </div>
  );
}

// Qué pinta la columna derecha de la fila i según el veredicto de la dosis.
type RowRx = { text: string; tone: 'strong' | 'muted' | 'warn' } | null;

function rowRx(dose: BlockDoseView, i: number, count: number): RowRx {
  switch (dose.kind) {
    case 'shared': {
      const exception = dose.exceptions[i];
      if (exception) return { text: exception, tone: 'strong' };
      // Con un solo ejercicio la dosis ya está entera en la línea de arriba.
      if (count === 1) return null;
      return { text: dose.inherit ? `hereda ${dose.inherit}` : 'hereda la dosis', tone: 'muted' };
    }
    case 'frame': {
      const text = dose.doses[i];
      return text ? { text, tone: 'muted' } : { text: 'sin dosis', tone: 'warn' };
    }
    case 'each': {
      const text = dose.doses[i];
      return text ? { text, tone: 'muted' } : { text: 'sin dosis', tone: 'warn' };
    }
    case 'undosed':
      return null; // el aviso del bloque ya lo dice una vez
  }
}

// Un compacto ↑/↓ (el ÚNICO patrón de reorden de líneas del editor).
function ReorderControl({
  index,
  count,
  label,
  onMove,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <span className="flex flex-col opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
      <button
        type="button"
        aria-label={`Subir ${label}`}
        disabled={index === 0}
        onClick={(e) => {
          e.stopPropagation();
          onMove(-1);
        }}
        className="v2-focus -my-0.5 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-30"
      >
        <MIcon name="keyboard_arrow_up" size={14} />
      </button>
      <button
        type="button"
        aria-label={`Bajar ${label}`}
        disabled={index === count - 1}
        onClick={(e) => {
          e.stopPropagation();
          onMove(1);
        }}
        className="v2-focus -my-0.5 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-30"
      >
        <MIcon name="keyboard_arrow_down" size={14} />
      </button>
    </span>
  );
}

function ItemRow({
  item,
  index,
  count,
  rx,
  onEdit,
  onMove,
}: {
  item: EditorItem;
  index: number;
  count: number;
  rx: RowRx;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const valid = itemHasExercise(item);
  const name = valid ? item.exercise_name || 'Ejercicio' : 'Línea sin ejercicio';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        'group/row v2-focus flex cursor-pointer items-center gap-2.5 rounded-[var(--v2-r-s)] px-2 py-1.5 transition-colors',
        valid
          ? 'hover:bg-[color:var(--v2-surface-2)]'
          : 'bg-[color:var(--v2-danger-soft)]',
      )}
    >
      <span
        aria-hidden
        className="v2-num grid h-5 w-6 shrink-0 place-items-center rounded-[var(--v2-r-2xs)] border border-[color:var(--v2-border)] text-label font-bold text-[color:var(--v2-faint)]"
      >
        {rowTag(index)}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm font-semibold',
          valid ? 'text-[color:var(--v2-fg)]' : 'text-[color:var(--v2-danger)]',
        )}
      >
        {valid ? null : (
          <MIcon name="error" size={13} className="mr-1 inline-block align-[-2px]" />
        )}
        {name}
      </span>
      {rx ? (
        <span
          className={cn(
            'max-w-[55%] truncate text-xs',
            rx.tone === 'strong' && 'v2-num font-bold text-[color:var(--v2-fg)]',
            rx.tone === 'muted' && 'v2-num text-[color:var(--v2-muted)]',
            rx.tone === 'warn' && 'font-semibold text-[color:var(--v2-warn)]',
          )}
        >
          {rx.text}
        </span>
      ) : null}
      <ReorderControl index={index} count={count} label={name} onMove={onMove} />
    </div>
  );
}
