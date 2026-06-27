'use client';

// Small shared planning primitives used by Screen 6 + 7 — kept here (not in the
// foundation barrel) so the screen cluster owns them. ModalityTag/ModalityDot
// render the modality color axis on chips and session cards. DRY: both planning
// screens read these, never inline the tokens.

import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import { cn } from '@/lib/utils';

/** A solid dot in a modality's hue (type-rail / chip leading marker). */
export function ModalityDot({ modality, className }: { modality: V2Modality; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ background: `var(${MODALITY_META[modality].colorVar})` }}
    />
  );
}

/** A soft-filled modality chip (label + hue). */
export function ModalityTag({ modality }: { modality: V2Modality }) {
  const meta = MODALITY_META[modality];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ background: `var(${meta.softVar})`, color: `var(${meta.colorVar})` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(${meta.colorVar})` }} />
      {meta.label}
    </span>
  );
}
