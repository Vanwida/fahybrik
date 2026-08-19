'use client';

// PhaseEditor — the ordered sequence of one phase (calentamiento | principal |
// vuelta), redesigned around ONE open element at a time.
//
// Closed elements read as sentences (a Repetir folds to "6 × 1000 m @ 4:30 ·
// rec 2' parado"); tapping one opens ONLY it. Adding copies the previous element
// of the same kind — the coach corrects a copy instead of building from zero —
// and the new element opens itself, ready to edit. All mutation still goes
// through the pure tree-ops, so the structure stays valid by construction.

import { useState } from 'react';
import type { Element, RecoveryMode, Repeat, Segment } from '@fahybrid/shared/domain/prescription';
import { isRepeat } from '@fahybrid/shared/domain/prescription';
import { MIcon } from '@/components/ui/MIcon';
import { NumberCell } from '../../fields';
import { elementSentence } from '@/lib/dashboard/v2/run-structure-view';
import { SegmentRow, IconBtn, type RowHandlers } from './SegmentRow';
import {
  appendInto,
  canAddRepeatInto,
  canRemoveAt,
  defaultRecoverySegment,
  defaultRepeat,
  defaultWorkSegment,
  elementAt,
  moveAt,
  removeAt,
  removeSegmentField,
  setRepeatTimes,
  toKind,
  unwrapRepeat,
  updateElement,
  updateSegment,
  wrapInRepeat,
} from './tree-ops';

type AddKind = 'work' | 'recovery' | 'repeat';

interface Handlers extends RowHandlers {
  unwrap: (path: number[]) => void;
  setTimes: (path: number[], times: number) => void;
  addInto: (containerPath: number[], kind: AddKind) => void;
}

const keyOf = (path: number[]): string => path.join('.');

/** The last segment of `kind` anywhere in a container — the copy-source for adds. */
function lastSegmentOfKind(elements: Element[], kind: Segment['kind']): Segment | null {
  let found: Segment | null = null;
  const walk = (els: Element[]): void => {
    for (const el of els) {
      if (isRepeat(el)) walk(el.elements);
      else if (el.kind === kind) found = el;
    }
  };
  walk(elements);
  return found;
}

export function PhaseEditor({ elements, onChange }: { elements: Element[]; onChange: (next: Element[]) => void }) {
  // Exactly one open element. Key = path joined — a child's key starts with its
  // parent Repeat's key, which is what keeps the parent expanded while editing it.
  const [openKey, setOpenKey] = useState<string | null>(null);

  const handlers: Handlers = {
    toKind: (path, kind) => {
      const s = elementAt(elements, path) as Segment | undefined;
      if (s) onChange(updateElement(elements, path, toKind(s, kind)));
    },
    setMeasure: (path, measure) => onChange(updateSegment(elements, path, { measure })),
    setTarget: (path, target) => onChange(updateSegment(elements, path, { target })),
    patchSegment: (path, patch) => onChange(updateSegment(elements, path, patch)),
    removeField: (path, field) => onChange(removeSegmentField(elements, path, field)),
    setRecoveryMode: (path, mode: RecoveryMode) => {
      const s = elementAt(elements, path) as Segment | undefined;
      const patch: Partial<Segment> = { recovery_mode: mode };
      // `parado` (standing rest) is timed → force a duration measure.
      if (mode === 'parado' && s?.measure.type === 'distance') patch.measure = { type: 'duration', s: 60 };
      onChange(updateSegment(elements, path, patch));
    },
    remove: (path) => {
      if (!canRemoveAt(elements, path)) return; // never empty a phase / repeat
      setOpenKey(null);
      onChange(removeAt(elements, path));
    },
    move: (path, dir) => onChange(moveAt(elements, path, dir)),
    wrap: (path) => onChange(wrapInRepeat(elements, path)),
    unwrap: (path) => onChange(unwrapRepeat(elements, path)),
    setTimes: (path, times) => onChange(setRepeatTimes(elements, path, times)),
    addInto: (containerPath, kind) => {
      // COPY THE PREVIOUS of the same kind (the whole point of "defaults with
      // memory"): a second work bout is almost always the first with a tweak.
      const el: Element =
        kind === 'repeat'
          ? defaultRepeat()
          : structuredClone(lastSegmentOfKind(elements, kind) ?? (kind === 'work' ? defaultWorkSegment() : defaultRecoverySegment()));
      const container = containerPath.length === 0 ? elements : (elementAt(elements, containerPath) as Repeat | undefined)?.elements;
      const newIndex = container?.length ?? 0;
      onChange(appendInto(elements, containerPath, el));
      // The new element opens itself, ready to edit.
      setOpenKey(keyOf([...containerPath, newIndex]));
    },
  };

  return (
    <div className="space-y-2">
      <ElementList elements={elements} basePath={[]} handlers={handlers} openKey={openKey} setOpenKey={setOpenKey} />
      <AddBar containerPath={[]} handlers={handlers} />
    </div>
  );
}

function ElementList({
  elements,
  basePath,
  handlers,
  openKey,
  setOpenKey,
}: {
  elements: Element[];
  basePath: number[];
  handlers: Handlers;
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
}) {
  const canRemove = elements.length > 1; // never let a container go empty
  return (
    <div className="space-y-2">
      {elements.map((el, i) => {
        const path = [...basePath, i];
        const key = keyOf(path);
        return isRepeat(el) ? (
          <RepeatBlock
            key={i}
            repeat={el}
            path={path}
            handlers={handlers}
            canRemove={canRemove}
            openKey={openKey}
            setOpenKey={setOpenKey}
          />
        ) : (
          <SegmentRow
            key={i}
            segment={el}
            path={path}
            handlers={handlers}
            canRemove={canRemove}
            open={openKey === key}
            onOpen={() => setOpenKey(key)}
            onClose={() => setOpenKey(null)}
          />
        );
      })}
    </div>
  );
}

function RepeatBlock({
  repeat,
  path,
  handlers,
  canRemove,
  openKey,
  setOpenKey,
}: {
  repeat: Repeat;
  path: number[];
  handlers: Handlers;
  canRemove: boolean;
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
}) {
  const key = keyOf(path);
  // Expanded while itself or ANY of its children is the open element.
  const expanded = openKey === key || (openKey?.startsWith(`${key}.`) ?? false);

  // CLOSED — the whole repeat folds to one sentence: "6 × 1000 m @ 4:30 · rec 2'".
  if (!expanded) {
    return (
      <div className="group flex items-center gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-accent-soft)] bg-[color:var(--v2-accent-soft)]/30 px-3 py-2.5">
        <MIcon name="repeat" size={15} className="shrink-0 text-[color:var(--v2-accent)]" />
        <button
          type="button"
          onClick={() => setOpenKey(key)}
          className="v2-focus min-w-0 flex-1 truncate text-left font-mono text-body text-[color:var(--v2-fg)]"
          aria-label={`Editar repetición: ${elementSentence(repeat)}`}
        >
          <b className="font-bold text-[color:var(--v2-accent)]">{repeat.times} ×</b>{' '}
          {repeat.elements.map(elementSentence).join(' · ')}
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <IconBtn icon="arrow_upward" label="Subir" onClick={() => handlers.move(path, -1)} />
          <IconBtn icon="arrow_downward" label="Bajar" onClick={() => handlers.move(path, 1)} />
          <IconBtn icon="delete" label="Eliminar" disabled={!canRemove} onClick={() => handlers.remove(path)} />
        </div>
        <MIcon name="expand_more" size={16} className="shrink-0 text-[color:var(--v2-faint)]" />
      </div>
    );
  }

  return (
    <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-accent)]/40 bg-[color:var(--v2-accent-soft)]/30 p-2">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[color:var(--v2-accent)]">
          <MIcon name="repeat" size={14} />
          Repetir
        </span>
        <NumberCell
          value={repeat.times}
          ariaLabel="Número de repeticiones"
          min={2}
          max={20}
          suffix="×"
          className="w-16"
          onChange={(v) => handlers.setTimes(path, Math.min(20, Math.max(2, Math.round(v ?? 2))))}
        />
        <div className="ml-auto flex items-center gap-0.5">
          <IconBtn icon="arrow_upward" label="Subir" onClick={() => handlers.move(path, -1)} />
          <IconBtn icon="arrow_downward" label="Bajar" onClick={() => handlers.move(path, 1)} />
          <IconBtn icon="unfold_more" label="Deshacer repetición" onClick={() => handlers.unwrap(path)} />
          <IconBtn icon="delete" label="Eliminar" disabled={!canRemove} onClick={() => handlers.remove(path)} />
          <IconBtn icon="expand_less" label="Plegar" onClick={() => setOpenKey(null)} />
        </div>
      </div>
      <div className="border-l-2 border-[color:var(--v2-accent-soft)] pl-2">
        <ElementList elements={repeat.elements} basePath={path} handlers={handlers} openKey={openKey} setOpenKey={setOpenKey} />
        <div className="mt-2">
          <AddBar containerPath={path} handlers={handlers} />
        </div>
      </div>
    </div>
  );
}

function AddBar({ containerPath, handlers }: { containerPath: number[]; handlers: Handlers }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AddButton icon="add" label="Trabajo" onClick={() => handlers.addInto(containerPath, 'work')} />
      <AddButton icon="add" label="Recuperación" onClick={() => handlers.addInto(containerPath, 'recovery')} />
      {canAddRepeatInto(containerPath) ? (
        <AddButton icon="repeat" label="Repetir ×N" onClick={() => handlers.addInto(containerPath, 'repeat')} />
      ) : null}
    </div>
  );
}

function AddButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)] px-2.5 py-1 text-label font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent)]"
    >
      <MIcon name={icon} size={14} />
      {label}
    </button>
  );
}
