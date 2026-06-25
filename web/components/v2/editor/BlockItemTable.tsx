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
}: {
  block: EditorBlock;
  onEditItem: (uid: string) => void;
  onAddItem: () => void;
}) {
  const kind = tableKindFor(block);

  return (
    <div className="space-y-1.5">
      {block.items.length === 0 ? (
        <p className="px-1 py-1.5 text-xs text-[color:var(--v2-muted)]">
          {block.source_block_id
            ? 'Bloque de biblioteca — se hidrata al guardar.'
            : 'Sin ítems todavía.'}
        </p>
      ) : kind === 'metcon' ? (
        <MetconTable block={block} onEditItem={onEditItem} />
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="v2-micro">
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
            {block.items.map((it) => (
              <ItemRow key={it.uid} item={it} kind={kind} onEdit={() => onEditItem(it.uid)} />
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

function ItemRow({
  item,
  kind,
  onEdit,
}: {
  item: EditorItem;
  kind: TableKind;
  onEdit: () => void;
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
}: {
  block: EditorBlock;
  onEditItem: (uid: string) => void;
}) {
  const head = block.items[0]?.prescription;
  const formatLabel = head ? schemeLabel(head.scheme) : 'Metcon';
  const duration = head?.total_s
    ? ` ${Math.round(head.total_s / 60)}'`
    : head?.rounds
      ? ` ${head.rounds} rondas`
      : '';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-mod-circuito-soft)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--v2-mod-circuito)]">
          {formatLabel}
          {duration}
        </span>
      </div>
      <ul className="space-y-0.5">
        {block.items.map((it) => {
          const valid = itemHasExercise(it);
          return (
            <li key={it.uid}>
              <button
                type="button"
                onClick={() => onEditItem(it.uid)}
                className={
                  valid
                    ? 'v2-focus flex w-full items-center justify-between gap-2 rounded-[var(--v2-r-s)] px-1.5 py-1 text-left transition-colors hover:bg-[color:var(--v2-surface-2)]'
                    : 'v2-focus flex w-full items-center justify-between gap-2 rounded-[var(--v2-r-s)] bg-[color:var(--v2-danger-soft)] px-1.5 py-1 text-left transition-colors'
                }
              >
                <span
                  className={
                    valid
                      ? 'truncate text-sm font-medium text-[color:var(--v2-fg)]'
                      : 'flex items-center gap-1 truncate text-sm font-medium text-[color:var(--v2-danger)]'
                  }
                >
                  {valid ? null : <MIcon name="error" size={13} />}
                  {valid ? it.exercise_name || 'Componente' : 'Componente sin ejercicio'}
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
