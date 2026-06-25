'use client';

// AdvancedHatch — the "Ajuste avanzado" escape hatch (UX pase §5). The existing
// full-axes editor (PrescriptionFields: modalidad × medida × objetivo × esquema)
// is NOT thrown away — it is REUSED here, collapsed at the foot of each block, for
// the rare case an archetype's tailored form doesn't cover. Always present, quiet,
// closed by default; the coach who needs an exotic override opens it, the 95% who
// don't never see it. No "smart" auto-surfacing (that smells of AI).

import { useState } from 'react';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { MIcon } from '@/components/ui/MIcon';
import { PrescriptionFields } from './PrescriptionFields';

export function AdvancedHatch({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="v2-focus flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-[color:var(--v2-surface-2)]"
      >
        <MIcon
          name={open ? 'expand_more' : 'chevron_right'}
          size={16}
          className="shrink-0 text-[color:var(--v2-faint)]"
        />
        <span className="text-xs font-bold text-[color:var(--v2-muted)]">Ajuste avanzado</span>
        <span className="ml-auto hidden text-[11px] text-[color:var(--v2-faint)] sm:inline">
          modalidad · medida · objetivo · esquema — para el caso que el tipo no cubre
        </span>
      </button>
      {open ? (
        <div className="border-t border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-4">
          <PrescriptionFields value={value} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}
