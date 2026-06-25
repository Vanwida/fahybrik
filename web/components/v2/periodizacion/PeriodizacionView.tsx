'use client';

// PeriodizacionView — the client orchestrator for the Periodización section. Owns
// the active area (Niveles | Secuencias), mirrored to ?area= so it's linkable, and
// a SegmentedControl to switch between them. Both areas are the coach's framework
// DATA, edited in place and persisted to the real APIs.
//
//   · Niveles    — the rows of the matrix (athlete_levels).
//   · Secuencias — the matrix itself (nivel × días) + the in-cell sequence editor;
//                  the ORDER of microciclos in a cell IS the periodization.
//
// Inline orientation (shared primitives, DRY): a PipelineCue (this section owns
// steps 1 & 5 of the build flow) + a dismissable IntroStrip + an InfoDot recall
// in the title. The Secuencias matrix carries a ContextHint (placed inside its
// panel). All orientation is light, agnostic and fully turn-off-able.

import { useCallback, useState } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import {
  IntroStrip,
  InfoDot,
  PipelineCue,
  useOrientationState,
  type IntroMicroStep,
} from '@/components/v2/orientacion';
import type { PipelineProgress, PipelineStepKey } from '@/lib/dashboard/v2/orientacion-types';
import type { V2PeriodizacionData } from '@/lib/dashboard/v2/periodizacion';
import type { V2SecuenciasData } from '@/lib/dashboard/v2/secuencias';
import { NivelesPanel } from './NivelesPanel';
import { SecuenciasPanel } from './secuencias/SecuenciasPanel';

export type PeriodizacionArea = 'niveles' | 'secuencias';

const AREA_OPTIONS: ReadonlyArray<{ value: PeriodizacionArea; label: string }> = [
  { value: 'niveles', label: 'Niveles' },
  { value: 'secuencias', label: 'Secuencias' },
];

const AREA_TITLE: Record<PeriodizacionArea, string> = {
  niveles: 'niveles',
  secuencias: 'secuencias',
};

// This section spans the first and last steps of the build pipeline.
const PERIODIZACION_STEPS: readonly PipelineStepKey[] = ['niveles_fases', 'secuencias'];

const SECTION_KEY = 'periodizacion';

// The IntroStrip line adapts to the active area (one sentence each, ≤22 words).
const AREA_INTRO_LINE: Record<PeriodizacionArea, React.ReactNode> = {
  niveles: (
    <>
      <b>Tus niveles</b> clasifican a cada atleta — son las filas de la matriz de Secuencias.
    </>
  ),
  secuencias: (
    <>
      La matriz <b>nivel × días</b>: en cada celda, el orden de tus microciclos.
    </>
  ),
};

// The 3 micro-steps describe the whole section's role (same across areas — they
// teach the flow, not the current tab).
const INTRO_STEPS: IntroMicroStep[] = [
  {
    title: 'Define tus niveles',
    body: (
      <>
        El marco de tu método: los niveles clasifican al atleta — las filas de la matriz.
      </>
    ),
  },
  {
    title: 'Encadena en Secuencias',
    body: (
      <>
        La matriz <b>nivel × días</b>: en cada celda, el orden de tus microciclos.
      </>
    ),
  },
  {
    title: 'El sistema opera solo',
    body: <>El atleta cae en su celda y recibe el plan. Tú lo vigilas en Hoy.</>,
  },
];

export function PeriodizacionView({
  data,
  secuencias,
  initialArea,
  coachKey,
  progress,
}: {
  data: V2PeriodizacionData;
  secuencias: V2SecuenciasData;
  initialArea: PeriodizacionArea;
  coachKey: string;
  progress: PipelineProgress;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [area, setArea] = useState<PeriodizacionArea>(initialArea);
  const orient = useOrientationState(coachKey, SECTION_KEY);

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
            {orient.hydrated && !orient.visible ? (
              <InfoDot onClick={orient.recall} className="ml-2" />
            ) : null}
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

      {/* inline orientation: pipeline cue (always present, minimal) + intro strip */}
      <div className="mt-5">
        <PipelineCue
          coachKey={coachKey}
          sectionKey={SECTION_KEY}
          activeKeys={PERIODIZACION_STEPS}
          progress={progress}
          line={
            area === 'secuencias' ? (
              <>
                Ordena tus <b>secuencias</b> · el último paso antes de que opere solo
              </>
            ) : (
              <>
                Define <b>tus niveles</b> · el marco de tu método
              </>
            )
          }
        />
        {orient.visible ? (
          <IntroStrip
            icon="account_tree"
            line={AREA_INTRO_LINE[area]}
            steps={INTRO_STEPS}
            expanded={orient.expanded}
            onToggle={orient.toggleExpanded}
            onDismiss={orient.dismiss}
          />
        ) : null}
      </div>

      <div className="mt-1">
        {area === 'niveles' ? (
          <NivelesPanel initialLevels={data.levels} />
        ) : (
          <SecuenciasPanel initial={secuencias} />
        )}
      </div>
    </div>
  );
}
