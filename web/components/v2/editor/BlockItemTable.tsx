'use client';

// BlockItemTable — SCREEN 8 type-specific item tables inside a session block.
// The table SHAPE follows the block's dominant modality (the spec's four):
//   - Calentamiento/movilidad: Movimiento | Tiempo/reps
//   - Fuerza:                   Ejercicio | Series×reps | Intensidad | RPE | Descanso
//   - Metcon:                   format pills + objetivo line + component rows
//   - Carrera (tramos):         Tramo | Medida | Objetivo
// These are DENSE READOUTS rendered from the structured Prescription via the
// shared prescriptionToText (no free text). Each row links to the full BlockEditor
// (via onEditItem) for axis-level edits; the table itself is the at-a-glance view
// + the dashed "＋ añadir ejercicio/movimiento/tramo".

import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import {
  formatTarget,
  prescriptionToText,
  setMeasure,
  setTarget,
} from '@fahybrid/shared/domain/prescription';
import { itemHasExercise } from '@/lib/dashboard/v2/item-validity';
import { MIcon } from '@/components/ui/MIcon';

type TableKind = 'calentamiento' | 'fuerza' | 'metcon' | 'carrera';

function tableKindFor(block: EditorBlock): TableKind {
  const first = block.items[0];
  const m = first?.prescription.modality;
  if (m === 'strength') return 'fuerza';
  if (m === 'run') return 'carrera';
  if (m === 'core' || m === 'mobility') return 'calentamiento';
  // functional / erg / mixed → metcon-style (format + components)
  const g = block.group;
  if (g === 'calentamiento') return 'calentamiento';
  return 'metcon';
}

const ADD_LABEL: Record<TableKind, string> = {
  calentamiento: 'añadir movimiento',
  fuerza: 'añadir ejercicio',
  metcon: 'añadir componente',
  carrera: 'añadir tramo',
};

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
  const kind = tableKindFor(block);
  const count = block.items.length;

  return (
    <div className="space-y-1.5">
      {block.items.length === 0 ? (
        <p className="px-1 py-1.5 text-xs text-[color:var(--v2-muted)]">Sin ejercicios todavía.</p>
      ) : kind === 'metcon' ? (
        <MetconTable block={block} onEditItem={onEditItem} onMoveItem={onMoveItem} />
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="v2-micro">
              <th className="pb-1" scope="col" aria-label="Orden" />
              {headersFor(kind).map((h, i) => (
                <th
                  key={h}
                  className={i === 0 ? 'pb-1 pl-1' : 'pb-1 pr-1 text-right'}
                  scope="col"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.items.map((it, i) => (
              <ItemRow
                key={it.uid}
                item={it}
                kind={kind}
                index={i}
                count={count}
                onEdit={() => onEditItem(it.uid)}
                onMove={(dir) => onMoveItem(it.uid, dir)}
              />
            ))}
          </tbody>
        </table>
      )}

      <button
        type="button"
        onClick={onAddItem}
        className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
      >
        <MIcon name="add" size={14} />
        {ADD_LABEL[kind]}
      </button>
    </div>
  );
}

function headersFor(kind: TableKind): string[] {
  switch (kind) {
    case 'calentamiento':
      return ['Movimiento', 'Tiempo / reps'];
    case 'fuerza':
      return ['Ejercicio', 'Series×reps', 'Intensidad', 'RPE', 'Desc'];
    case 'carrera':
      return ['Tramo', 'Medida', 'Objetivo'];
    case 'metcon':
      return [];
  }
}

// A compact ↑/↓ reorder control (the ONE reorder pattern used across the editor).
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
    <span className="flex flex-col">
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
  kind,
  index,
  count,
  onEdit,
  onMove,
}: {
  item: EditorItem;
  kind: TableKind;
  index: number;
  count: number;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const p = item.prescription;
  const valid = itemHasExercise(item);
  const name = valid ? item.exercise_name || 'Ejercicio' : 'Línea sin ejercicio';

  let cells: React.ReactNode;
  if (kind === 'calentamiento' || kind === 'carrera') {
    const measure = p.sets?.[0] ? setMeasure(p.sets[0]) : undefined;
    const measureLabel = measure ? prescriptionToText({ scheme: 'sets', sets: [{ measure }] }) : '—';
    const target = p.target ?? (p.sets?.[0] ? setTarget(p.sets[0]) : undefined);
    if (kind === 'carrera') {
      cells = (
        <>
          <td className="v2-num py-1 pr-2 text-right text-xs text-[color:var(--v2-muted)]">
            {measureLabel}
          </td>
          <td className="v2-num py-1 pr-1 text-right text-xs text-[color:var(--v2-muted)]">
            {target ? formatTarget(target) : '—'}
          </td>
        </>
      );
    } else {
      cells = (
        <td className="v2-num py-1 pr-1 text-right text-xs text-[color:var(--v2-muted)]">
          {measureLabel}
        </td>
      );
    }
  } else {
    // fuerza — series×reps | intensidad | rpe | descanso
    const sets = p.sets ?? [];
    const reps = sets[0] ? setMeasure(sets[0]) : undefined;
    const repsStr = reps?.kind === 'reps' ? `${sets.length}×${reps.value}` : `${sets.length} series`;
    const target = sets[0] ? setTarget(sets[0]) : undefined;
    const isRpe = target?.kind === 'rpe';
    const intensity = target && !isRpe ? formatTarget(target) : '—';
    const rpe = isRpe && target.kind === 'rpe' ? `RPE ${target.value ?? '—'}` : '—';
    const rest = sets.find((s) => s.rest_s)?.rest_s;
    cells = (
      <>
        <td className="v2-num py-1 pr-2 text-right text-xs text-[color:var(--v2-fg)]">{repsStr}</td>
        <td className="v2-num py-1 pr-2 text-right text-xs text-[color:var(--v2-muted)]">{intensity}</td>
        <td className="v2-num py-1 pr-2 text-right text-xs text-[color:var(--v2-muted)]">{rpe}</td>
        <td className="v2-num py-1 pr-1 text-right text-xs text-[color:var(--v2-muted)]">
          {rest ? `${rest}s` : '—'}
        </td>
      </>
    );
  }

  return (
    <tr
      tabIndex={0}
      role="button"
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
      className={
        valid
          ? 'v2-focus cursor-pointer border-t border-[color:var(--v2-border)] transition-colors hover:bg-[color:var(--v2-surface-2)]'
          : 'v2-focus cursor-pointer border-t border-[color:var(--v2-border)] bg-[color:var(--v2-danger-soft)] transition-colors'
      }
    >
      <td className="w-5 py-1 align-middle">
        <ReorderControl index={index} count={count} label={name} onMove={onMove} />
      </td>
      <td
        className={
          valid
            ? 'py-1 pl-1 pr-2 text-sm font-medium text-[color:var(--v2-fg)]'
            : 'py-1 pl-1 pr-2 text-sm font-medium text-[color:var(--v2-danger)]'
        }
      >
        {valid ? null : <MIcon name="error" size={13} className="mr-1 inline-block align-[-2px]" />}
        {name}
      </td>
      {cells}
    </tr>
  );
}

// ── Metcon block: format pills + objetivo line + component rows ──────────────
function MetconTable({
  block,
  onEditItem,
  onMoveItem,
}: {
  block: EditorBlock;
  onEditItem: (uid: string) => void;
  onMoveItem: (uid: string, dir: -1 | 1) => void;
}) {
  const head = block.items[0]?.prescription;
  const formatLabel = head ? schemeLabel(head.scheme) : 'Metcon';
  const duration = head?.total_s
    ? ` ${Math.round(head.total_s / 60)}'`
    : head?.rounds
      ? ` ${head.rounds} rondas`
      : '';
  const count = block.items.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-mod-circuito-soft)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--v2-mod-circuito)]">
          {formatLabel}
          {duration}
        </span>
      </div>
      <ul className="space-y-0.5">
        {block.items.map((it, i) => {
          const valid = itemHasExercise(it);
          const label = valid ? it.exercise_name || 'Componente' : 'Componente sin ejercicio';
          return (
            <li
              key={it.uid}
              className={
                valid
                  ? 'flex items-center gap-1.5 rounded-[var(--v2-r-s)] px-1.5 py-1 transition-colors hover:bg-[color:var(--v2-surface-2)]'
                  : 'flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-danger-soft)] px-1.5 py-1'
              }
            >
              <ReorderControl
                index={i}
                count={count}
                label={label}
                onMove={(dir) => onMoveItem(it.uid, dir)}
              />
              <button
                type="button"
                onClick={() => onEditItem(it.uid)}
                className="v2-focus flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
              >
                <span
                  className={
                    valid
                      ? 'truncate text-sm font-medium text-[color:var(--v2-fg)]'
                      : 'flex items-center gap-1 truncate text-sm font-medium text-[color:var(--v2-danger)]'
                  }
                >
                  {valid ? null : <MIcon name="error" size={13} />}
                  {label}
                </span>
                <span className="v2-num shrink-0 text-xs text-[color:var(--v2-muted)]">
                  {prescriptionToText(it.prescription) || '—'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function schemeLabel(scheme: string): string {
  switch (scheme) {
    case 'amrap':
      return 'AMRAP';
    case 'emom':
      return 'EMOM';
    case 'for_time':
      return 'For Time';
    case 'interval':
      return 'Intervalos';
    case 'rounds':
      return 'Rondas';
    case 'steady':
      return 'Continuo';
    default:
      return 'Metcon';
  }
}
