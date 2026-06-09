'use client';

import type { TemplateSegmentPreview } from '@/lib/dashboard/templates/types';
import { formatSegmentLine } from '@/lib/dashboard/templates/format-segment';
import { cn } from '@/lib/utils';

interface WorkoutBlockCardProps {
  segment: TemplateSegmentPreview;
  selected?: boolean;
  onSelect?: () => void;
}

export function WorkoutBlockCard({ segment, selected, onSelect }: WorkoutBlockCardProps) {
  const line = formatSegmentLine(segment);
  const tag = segment.exercise_category.replace(/_/g, ' ');

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      className={cn(
        'w-full rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-3 text-left transition-colors',
        'hover:border-[color:var(--surface-variant)]',
        selected && 'border-[color:var(--accent)] shadow-[0_0_12px_rgba(240,106,42,0.15)]',
      )}
    >
      <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
        {tag}
      </span>
      <p className="mt-1 text-sm font-semibold leading-tight text-[color:var(--fg)]">
        {segment.exercise_name}
      </p>
      {line !== segment.exercise_name ? (
        <p className="mt-1.5 text-xs text-[color:var(--text-muted)]">{line}</p>
      ) : null}
    </button>
  );
}
