'use client';

// PeriodizacionView — the client orchestrator for the Periodización section. Owns
// the active area (Niveles | Fases), mirrored to ?area= so it's linkable, and a
// SegmentedControl to switch between the two. Both areas are the coach's framework
// DATA, edited in place and persisted to the real APIs.
//
// Secuencias (the level × days matrix) is a SEPARATE later task and is NOT a tab
// here yet — adding a tab that routes nowhere would be a dead link. The two areas
// shipped here are Niveles and Fases.

import { useCallback, useState } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import type { V2PeriodizacionData } from '@/lib/dashboard/v2/periodizacion';
import { NivelesPanel } from './NivelesPanel';
import { FasesPanel } from './FasesPanel';

export type PeriodizacionArea = 'niveles' | 'fases';

const AREA_OPTIONS: ReadonlyArray<{ value: PeriodizacionArea; label: string }> = [
  { value: 'niveles', label: 'Niveles' },
  { value: 'fases', label: 'Fases' },
];

export function PeriodizacionView({
  data,
  initialArea,
}: {
  data: V2PeriodizacionData;
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
            <span className="text-[color:var(--v2-muted)]">· {area === 'niveles' ? 'niveles' : 'fases'}</span>
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
        ) : (
          <FasesPanel initialPhases={data.phases} />
        )}
      </div>
    </div>
  );
}
