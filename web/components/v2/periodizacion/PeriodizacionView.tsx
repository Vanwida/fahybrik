'use client';

// PeriodizacionView — the client orchestrator for the Periodización section. Owns
// the active area (Niveles | Fases | Secuencias), mirrored to ?area= so it's
// linkable, and a SegmentedControl to switch between the three. All areas are the
// coach's framework DATA, edited in place and persisted to the real APIs.
//
//   · Niveles    — the rows of the matrix (athlete_levels).
//   · Fases      — the optional color axis (methodology_phases).
//   · Secuencias — the matrix itself (nivel × días) + the in-cell sequence editor.

import { useCallback, useState } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import type { V2PeriodizacionData } from '@/lib/dashboard/v2/periodizacion';
import type { V2SecuenciasData } from '@/lib/dashboard/v2/secuencias';
import { NivelesPanel } from './NivelesPanel';
import { FasesPanel } from './FasesPanel';
import { SecuenciasPanel } from './secuencias/SecuenciasPanel';

export type PeriodizacionArea = 'niveles' | 'fases' | 'secuencias';

const AREA_OPTIONS: ReadonlyArray<{ value: PeriodizacionArea; label: string }> = [
  { value: 'niveles', label: 'Niveles' },
  { value: 'fases', label: 'Fases' },
  { value: 'secuencias', label: 'Secuencias' },
];

const AREA_TITLE: Record<PeriodizacionArea, string> = {
  niveles: 'niveles',
  fases: 'fases',
  secuencias: 'secuencias',
};

export function PeriodizacionView({
  data,
  secuencias,
  initialArea,
}: {
  data: V2PeriodizacionData;
  secuencias: V2SecuenciasData;
  initialArea: PeriodizacionArea;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [area, setArea] = useState<PeriodizacionArea>(initialArea);

  const onArea = useCallback(
    (next: PeriodizacionArea) => {
      setArea(next);
      router.replace(`${pathname}?area=${next}`, { scroll: false });
    },
    [router, pathname],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col">
      {/* topbar — title + area switch */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="v2-display text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-fg)]">Periodización</span>{' '}
            <span className="text-[color:var(--v2-muted)]">· {AREA_TITLE[area]}</span>
          </h1>
          <p className="text-sm text-[color:var(--v2-muted)]">El marco de tu método.</p>
        </div>
        <div className="shrink-0">
          <SegmentedControl<PeriodizacionArea>
            options={AREA_OPTIONS}
            value={area}
            onChange={onArea}
            ariaLabel="Área de periodización"
          />
        </div>
      </div>

      <div className="mt-5">
        {area === 'niveles' ? (
          <NivelesPanel initialLevels={data.levels} />
        ) : area === 'fases' ? (
          <FasesPanel initialPhases={data.phases} />
        ) : (
          <SecuenciasPanel initial={secuencias} />
        )}
      </div>
    </div>
  );
}
