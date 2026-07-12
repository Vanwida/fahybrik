'use client';

// PhaseEditor — the ordered sequence of one phase (calentamiento | principal |
// vuelta). Renders each element as a SegmentRow or a nested Repeat block, plus the
// "+ Trabajo / + Recuperación / + Repetir" adders. All mutation goes through the
// pure tree-ops, so the structure stays valid (depth ≤ 2) by construction.

import type { Element, RecoveryMode, Segment } from '@fahybrid/shared/domain/prescription';
import { isRepeat } from '@fahybrid/shared/domain/prescription';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/ui/MIcon';
import { NumberCell } from '../../fields';
import { SegmentRow, type RowHandlers } from './SegmentRow';
import {
  appendInto,
  canAddRepeatInto,
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

function makeHandlers(elements: Element[], onChange: (next: Element[]) => void): Handlers {
  const seg = (path: number[]) => elementAt(elements, path) as Segment | undefined;
  return {
    toKind: (path, kind) => {
      const s = seg(path);
      if (s) onChange(updateElement(elements, path, toKind(s, kind)));
    },
    setMeasure: (path, measure) => onChange(updateSegment(elements, path, { measure })),
    setTarget: (path, target) => onChange(updateSegment(elements, path, { target })),
    patchSegment: (path, patch) => onChange(updateSegment(elements, path, patch)),
    removeField: (path, field) => onChange(removeSegmentField(elements, path, field)),
    setRecoveryMode: (path, mode: RecoveryMode) => {
      const s = seg(path);
      const patch: Partial<Segment> = { recovery_mode: mode };
      // `parado` (standing rest) is timed → force a duration measure.
      if (mode === 'parado' && s?.measure.type === 'distance') patch.measure = { type: 'duration', s: 60 };
      onChange(updateSegment(elements, path, patch));
    },
    remove: (path) => onChange(removeAt(elements, path)),
    move: (path, dir) => onChange(moveAt(elements, path, dir)),
    wrap: (path) => onChange(wrapInRepeat(elements, path)),
    unwrap: (path) => onChange(unwrapRepeat(elements, path)),
    setTimes: (path, times) => onChange(setRepeatTimes(elements, path, times)),
    addInto: (containerPath, kind) => {
      const el: Element = kind === 'work' ? defaultWorkSegment() : kind === 'recovery' ? defaultRecoverySegment() : defaultRepeat();
      onChange(appendInto(elements, containerPath, el));
    },
  };
}

export function PhaseEditor({ elements, onChange }: { elements: Element[]; onChange: (next: Element[]) => void }) {
  const handlers = makeHandlers(elements, onChange);
  return (
    <div className="space-y-2">
      <ElementList elements={elements} basePath={[]} handlers={handlers} />
      <AddBar containerPath={[]} handlers={handlers} />
    </div>
  );
}

function ElementList({ elements, basePath, handlers }: { elements: Element[]; basePath: number[]; handlers: Handlers }) {
  return (
    <div className="space-y-2">
      {elements.map((el, i) => {
        const path = [...basePath, i];
        return isRepeat(el) ? (
          <RepeatBlock key={i} repeat={el} path={path} handlers={handlers} />
        ) : (
          <SegmentRow key={i} segment={el} path={path} handlers={handlers} />
        );
      })}
    </div>
  );
}

function RepeatBlock({ repeat, path, handlers }: { repeat: Extract<Element, { times: number }>; path: number[]; handlers: Handlers }) {
  return (
    <div className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-accent-soft)] bg-[color:var(--v2-accent-soft)]/30 p-2">
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
          <IconBtn icon="delete" label="Eliminar" onClick={() => handlers.remove(path)} />
        </div>
      </div>
      <div className="border-l-2 border-[color:var(--v2-accent-soft)] pl-2">
        <ElementList elements={repeat.elements} basePath={path} handlers={handlers} />
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
      className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)] px-2.5 py-1 text-[11.5px] font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent)]"
    >
      <MIcon name={icon} size={14} />
      {label}
    </button>
  );
}

function IconBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="v2-focus inline-flex h-6 w-6 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-3)] hover:text-[color:var(--v2-fg)]"
    >
      <MIcon name={icon} size={15} />
    </button>
  );
}
