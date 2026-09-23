'use client';

// AdvancedHatch — the "Ajuste avanzado" escape hatch (UX pase §5). The existing
// full-axes editor (PrescriptionFields: modalidad × medida × objetivo × esquema)
// is NOT thrown away — it is REUSED here, collapsed at the foot of each block, for
// the rare case an archetype's tailored form doesn't cover. Always present, quiet,
// closed by default; the coach who needs an exotic override opens it, the 95% who
// don't never see it. No "smart" auto-surfacing (that smells of AI).

import { useState } from 'react';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/v2/ui';
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
    <div className="overflow-hidden rounded-panel border border-v2-border">
      <Button
        variant="ghost"
        size="lg"
        icon={open ? ChevronDown : ChevronRight}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full justify-start rounded-none border-0 px-3"
      >
        <span className="text-v2-fg">Ajuste avanzado</span>
        <span className="ml-auto hidden truncate t-meta font-normal text-v2-faint sm:inline">
          modalidad · medida · objetivo · esquema
        </span>
      </Button>
      {open ? (
        <div className="border-t border-v2-border p-4">
          <PrescriptionFields value={value} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}
