'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import type { BuilderSegment } from './template-types';
import { SegmentEditor } from './segment-editor';

interface Props {
  segment: BuilderSegment;
  index: number;
  expanded: boolean;
  onExpand: (uid: string | null) => void;
  onChange: (next: BuilderSegment) => void;
  onDelete: () => void;
  warning?: string | null;
}

const ZONE_TINT_VAR: Record<number, string> = {
  1: 'var(--z1-tint)',
  2: 'var(--z2-tint)',
  3: 'var(--z3-tint)',
  4: 'var(--z4-tint)',
  5: 'var(--z5-tint)',
};

const ZONE_VAR: Record<number, string> = {
  1: 'var(--z1)',
  2: 'var(--z2)',
  3: 'var(--z3)',
  4: 'var(--z4)',
  5: 'var(--z5)',
};

export function SegmentRow({
  segment,
  index,
  expanded,
  onExpand,
  onChange,
  onDelete,
  warning,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: segment.uid,
    data: { type: 'segment', segment },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/seg bg-[var(--surface)]',
        index > 0 && 'border-t border-[var(--hairline)]',
        expanded && 'bg-[var(--surface-elevated)]',
      )}
    >
      <div
        className="flex items-stretch"
        onClick={() => onExpand(expanded ? null : segment.uid)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onExpand(expanded ? null : segment.uid);
          }
        }}
      >
        <button
          type="button"
          aria-label="Reordenar"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="w-8 grid place-items-center text-[var(--muted)] hover:text-[var(--accent)] cursor-grab"
        >
          <span aria-hidden className="font-mono text-base leading-none">⋮⋮</span>
        </button>

        <div className="flex-1 py-3 pr-4 min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-xs text-[var(--muted)] tabular-nums w-5 shrink-0">
              {index + 1}
            </span>
            <span className="font-medium truncate">{segment.exercise_name}</span>
            {segment.params_json.hr_zone && (
              <span
                className="text-[10px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-sm font-mono"
                style={{
                  backgroundColor: ZONE_TINT_VAR[segment.params_json.hr_zone],
                  color: ZONE_VAR[segment.params_json.hr_zone],
                }}
              >
                Z{segment.params_json.hr_zone}
              </span>
            )}
            {warning && (
              <span
                className="text-[10px] uppercase tracking-[0.16em] text-[var(--warning)]"
                title={warning}
              >
                ⚠ {warning}
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--muted)] mt-0.5 font-mono truncate">
            {summarize(segment)}
          </div>
        </div>

        <div className="px-3 grid place-items-center text-[var(--muted)] text-sm">
          {expanded ? '−' : '+'}
        </div>
      </div>

      {expanded && (
        <SegmentEditor segment={segment} onChange={onChange} onDelete={onDelete} />
      )}
    </li>
  );
}

export function summarize(s: BuilderSegment): string {
  const p = s.params_json;
  const parts: string[] = [];

  if (p.sets && p.reps) parts.push(`${p.sets}×${p.reps}`);
  else if (p.reps) parts.push(`${p.reps} reps`);
  else if (p.sets) parts.push(`${p.sets} series`);

  if (p.distance_meters) parts.push(`${p.distance_meters}m`);
  if (p.time_seconds) parts.push(`${formatSeconds(p.time_seconds)}`);
  if (p.weight_kg) parts.push(`${p.weight_kg}kg`);
  if (p.weight_pct_1rm) parts.push(`${p.weight_pct_1rm}% 1RM`);
  if (p.pace_target) parts.push(p.pace_target);
  if (p.power_watts) parts.push(`${p.power_watts}W`);
  if (p.cadence_target) parts.push(p.cadence_target);
  if (p.rpe) parts.push(`RPE ${p.rpe}`);
  if (p.tempo) parts.push(`tempo ${p.tempo}`);
  if (p.rest_seconds) parts.push(`rest ${formatSeconds(p.rest_seconds)}`);
  if (p.intensity) parts.push(p.intensity);
  if (p.week_variants?.length) parts.push(`${p.week_variants.length}w prog`);
  if (p.conditional) parts.push('cond');
  if (p.alternatives?.length) parts.push(`+${p.alternatives.length} alt`);

  return parts.length ? parts.join(' · ') : 'Sin parámetros';
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (rem === 0) return `${m}min`;
  return `${m}:${String(rem).padStart(2, '0')}`;
}
