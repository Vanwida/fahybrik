'use client';

// AthletePreviewLine — the "Vista previa atleta →" resolved line under the
// adaptive CAMPOS. Renders the prescription as the compact athletic line the
// athlete reads, via the shared prescriptionToText (the SAME renderer the
// session drawer / week cards use — one source, never re-implemented).
//
// In the library editors (SCREEN 5 session, SCREEN 9 add-block) the block is
// athlete-AGNOSTIC: there is no concrete athlete profile to resolve relative
// targets against, so we show the prescribed line and label it "modelo". When a
// concrete athlete IS in context (day editor opened from an assigned plan), the
// caller can pass `athleteName` to title the preview; the resolver that turns a
// relative %RM/zone into absolute kg/pace lives in shared/domain and is wired in
// a follow-up (TODO(model) below) — until then the structured line is exact and
// unambiguous, which is the spec's "zero free text" guarantee.

import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription';
import { MIcon } from '@/components/ui/MIcon';

export function AthletePreviewLine({
  prescription,
  exerciseName,
  athleteName,
}: {
  prescription: Prescription;
  exerciseName?: string;
  athleteName?: string;
}) {
  const line = prescriptionToText(prescription);
  const head = exerciseName ? `${exerciseName} — ` : '';

  return (
    <div className="flex items-start gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-accent-soft)] px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-[color:var(--v2-accent)]">
        <MIcon name="visibility" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="v2-micro mb-0.5">
          {athleteName ? `Vista previa · ${athleteName}` : 'Vista previa atleta · modelo'}
        </p>
        <p className="v2-num text-sm leading-snug text-[color:var(--v2-fg)]">
          {head}
          {line || <span className="text-[color:var(--v2-muted)]">define los campos…</span>}
        </p>
        {/* TODO(model): resolve relative targets (%RM / zona) to absolute
            (kg / pace) using the athlete's profile resolver when an athlete is in
            context. The structured line is already unambiguous without it. */}
      </div>
    </div>
  );
}
