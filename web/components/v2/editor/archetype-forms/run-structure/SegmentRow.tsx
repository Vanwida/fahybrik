'use client';

// SegmentRow — one segment (trabajo | recuperación) in the sequence.
//
// REDESIGN (editor-bloques mockup): a row is CLOSED by default and reads as the
// SENTENCE the athlete will see — "1000 m @ 4:30/km" / "rec 2' parado". Only the
// row you tap opens, and an open row shows the few controls that matter; incline
// and cadence stay behind their add-chips. This is what killed the wall of
// always-on chips the old drawer stacked twelve-high per segment.

import type { RecoveryMode, Segment } from '@fahybrid/shared/domain/prescription';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/ui/MIcon';
import { NumberCell } from '../../fields';
import { InlineToggle } from '../form-controls';
import { segmentSentence } from '@/lib/dashboard/v2/run-structure-view';
import { PaceRuler } from '../../run-zones-context';
import { MeasureCell, ObjetivoCell } from './segment-controls';
import { canWrapInRepeat } from './tree-ops';

const RECOVERY_MODES: { value: RecoveryMode; label: string }[] = [
  { value: 'trote', label: 'Trote' },
  { value: 'caminar', label: 'Caminar' },
  { value: 'parado', label: 'Parado' },
];

export interface RowHandlers {
  toKind: (path: number[], kind: Segment['kind']) => void;
  setMeasure: (path: number[], measure: Segment['measure']) => void;
  setTarget: (path: number[], target: Segment['target']) => void;
  patchSegment: (path: number[], patch: Partial<Segment>) => void;
  removeField: (path: number[], field: 'incline_pct' | 'cadence_spm') => void;
  setRecoveryMode: (path: number[], mode: RecoveryMode) => void;
  remove: (path: number[]) => void;
  move: (path: number[], dir: -1 | 1) => void;
  wrap: (path: number[]) => void;
}

export function IconBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'v2-focus inline-flex h-6 w-6 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors',
        disabled ? 'opacity-30' : 'hover:bg-[color:var(--v2-elevated)] hover:text-[color:var(--v2-fg)]',
      )}
    >
      <MIcon name={icon} size={15} />
    </button>
  );
}

export function SegmentRow({
  segment,
  path,
  handlers,
  canRemove = true,
  open,
  onOpen,
  onClose,
}: {
  segment: Segment;
  path: number[];
  handlers: RowHandlers;
  canRemove?: boolean;
  /** Exactly one row is open at a time — the PhaseEditor owns the selection. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const isWork = segment.kind === 'work';

  // CLOSED — the sentence, one tap to open. The whole row is the button.
  if (!open) {
    return (
      <div
        className={cn(
          'group flex items-center gap-3 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2.5',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'h-6 w-1 shrink-0 rounded-full',
            isWork ? 'bg-[color:var(--v2-accent)]' : 'bg-[color:var(--v2-info)] opacity-50',
          )}
        />
        <button
          type="button"
          onClick={onOpen}
          className="v2-focus min-w-0 flex-1 truncate text-left font-mono text-[13.5px] text-[color:var(--v2-fg)]"
          aria-label={`Editar tramo: ${segmentSentence(segment)}`}
        >
          {segmentSentence(segment)}
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

  // OPEN — the few controls that matter, everything odd behind add-chips.
  return (
    <div
      className={cn(
        'rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface)] p-3',
        'border-[color:var(--v2-accent)]/45',
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'h-6 w-1 shrink-0 rounded-full',
            isWork ? 'bg-[color:var(--v2-accent)]' : 'bg-[color:var(--v2-info)] opacity-50',
          )}
        />
        <InlineToggle
          ariaLabel="Tipo de segmento"
          value={segment.kind}
          options={[
            { value: 'work', label: 'Trabajo' },
            { value: 'recovery', label: 'Recup.' },
          ]}
          onChange={(k) => handlers.toKind(path, k)}
        />
        <div className="ml-auto flex items-center gap-0.5">
          <IconBtn icon="arrow_upward" label="Subir" onClick={() => handlers.move(path, -1)} />
          <IconBtn icon="arrow_downward" label="Bajar" onClick={() => handlers.move(path, 1)} />
          <IconBtn icon="repeat" label="Repetir este segmento" disabled={!canWrapInRepeat(path)} onClick={() => handlers.wrap(path)} />
          <IconBtn icon="delete" label="Eliminar" disabled={!canRemove} onClick={() => handlers.remove(path)} />
          <IconBtn icon="expand_less" label="Cerrar" onClick={onClose} />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-[9rem] flex-1">
          <MeasureCell measure={segment.measure} onChange={(m) => handlers.setMeasure(path, m)} />
        </div>
        <div className="min-w-[11rem] flex-1">
          <ObjetivoCell target={segment.target} onChange={(t) => handlers.setTarget(path, t)} />
        </div>
      </div>

      {/* La regla del ritmo — where this pace lands for THIS athlete. Renders only
          when the surrounding surface provided zones (per-athlete editor) and the
          target speaks pace. */}
      {isWork ? <PaceRuler target={segment.target} /> : null}

      {/* Kind-specific extras */}
      {isWork ? (
        <WorkExtras
          segment={segment}
          onPatch={(patch) => handlers.patchSegment(path, patch)}
          onRemoveField={(field) => handlers.removeField(path, field)}
        />
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <span className="v2-micro">Recuperación</span>
          <InlineToggle
            ariaLabel="Modo de recuperación"
            value={segment.recovery_mode ?? 'parado'}
            options={RECOVERY_MODES}
            onChange={(mode) => handlers.setRecoveryMode(path, mode)}
          />
        </div>
      )}
    </div>
  );
}

// Optional inclinación (%) + cadencia (spm) for a work segment — off until added.
function WorkExtras({
  segment,
  onPatch,
  onRemoveField,
}: {
  segment: Segment;
  onPatch: (patch: Partial<Segment>) => void;
  onRemoveField: (field: 'incline_pct' | 'cadence_spm') => void;
}) {
  const hasIncline = segment.incline_pct !== undefined;
  const hasCadence = segment.cadence_spm !== undefined;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {hasIncline ? (
        <label className="flex items-center gap-1.5">
          <span className="v2-micro">Inclin.</span>
          <NumberCell value={segment.incline_pct ?? null} ariaLabel="Inclinación (%)" min={0} max={15} step={0.5} suffix="%" className="w-16" onChange={(v) => onPatch({ incline_pct: v ?? 0 })} />
          <IconBtn icon="close" label="Quitar inclinación" onClick={() => onRemoveField('incline_pct')} />
        </label>
      ) : (
        <AddChip icon="landscape" label="Inclinación" onClick={() => onPatch({ incline_pct: 5 })} />
      )}
      {hasCadence ? (
        <label className="flex items-center gap-1.5">
          <span className="v2-micro">Cadencia</span>
          <NumberCell value={segment.cadence_spm ?? null} ariaLabel="Cadencia (spm)" min={120} max={220} suffix="spm" className="w-20" onChange={(v) => onPatch({ cadence_spm: v ?? 120 })} />
          <IconBtn icon="close" label="Quitar cadencia" onClick={() => onRemoveField('cadence_spm')} />
        </label>
      ) : (
        <AddChip icon="footprint" label="Cadencia" onClick={() => onPatch({ cadence_spm: 180 })} />
      )}
    </div>
  );
}

function AddChip({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
    >
      <MIcon name={icon} size={13} />
      {label}
    </button>
  );
}
