'use client';

// v2 · ORIENTACIÓN · PRIMITIVE 3 — TeachingEmptyState.
//
// The empty state turned into a teaching moment (the best screen to orient — the
// coach has nothing to lose sight of). It EXTENDS the shared <EmptyState>: same
// dashed container, icon, title + description; this primitive adds the two
// orientation layers on top:
//   · why      — one line "por qué importa en el flujo".
//   · miniflow — the 5-step pipeline order with the current step highlighted, so
//                the coach sees WHERE this empty screen sits in the build.
//
// DENSITY (hard rules): title ≤ 6 words, `whatToDo` 1 sentence, `why` 1 sentence.
// Total ≤ 3 sentences before the action.
//
// Reuses EmptyState — does not re-implement the empty container.

import type { ReactNode } from 'react';
import { EmptyState } from '@/components/v2/EmptyState';
import { MIcon } from '@/components/ui/MIcon';
import type { PipelineStepKey } from '@/lib/dashboard/v2/orientacion-types';
import { PIPELINE_STEP_META } from './pipeline';

export function TeachingEmptyState({
  icon,
  /** ≤ 6 words. */
  title,
  /** 1 sentence: what the coach should do. */
  whatToDo,
  /** 1 sentence: why it matters in the flow. */
  why,
  /** Highlight this step in the mini pipeline order (omit to hide the mini-flow). */
  highlightStep,
  /** Action slot (e.g. the "Crear mi primer…" button). */
  action,
  className,
}: {
  icon?: string;
  title: string;
  whatToDo: ReactNode;
  why?: ReactNode;
  highlightStep?: PipelineStepKey;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      // EmptyState already renders the description; we pass the "what to do" line
      // as the description and stack the why + mini-flow + action below it.
      description={typeof whatToDo === 'string' ? whatToDo : undefined}
      className={className}
      action={
        <div className="flex w-full flex-col items-center gap-3">
          {/* When whatToDo is a ReactNode (inline <b>), render it here instead. */}
          {typeof whatToDo !== 'string' ? (
            <p className="max-w-[22rem] text-pretty text-xs leading-relaxed text-[color:var(--v2-muted)] [&_b]:font-semibold [&_b]:text-[color:var(--v2-fg)]">
              {whatToDo}
            </p>
          ) : null}
          {why ? (
            <p className="max-w-[22rem] text-pretty text-label leading-relaxed text-[color:var(--v2-faint)] [&_b]:font-semibold [&_b]:text-[color:var(--v2-muted)]">
              {why}
            </p>
          ) : null}
          {highlightStep ? <MiniFlow highlight={highlightStep} /> : null}
          {action ? <div>{action}</div> : null}
        </div>
      }
    />
  );
}

/** The 5-step pipeline order as a compact breadcrumb, current step in accent. */
function MiniFlow({ highlight }: { highlight: PipelineStepKey }) {
  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-1.5 text-label text-[color:var(--v2-muted)]">
      {PIPELINE_STEP_META.map((s, i) => {
        const on = s.key === highlight;
        return (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={on ? 'font-bold text-[color:var(--v2-accent-text)]' : undefined}>
              {s.name}
            </span>
            {i < PIPELINE_STEP_META.length - 1 ? (
              <span className="text-[color:var(--v2-faint)]" aria-hidden>
                <MIcon name="chevron_right" size={13} />
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
