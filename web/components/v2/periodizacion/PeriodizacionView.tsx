'use client';

// PeriodizacionView — the client orchestrator for the Periodización section.
// The model is NESTED, not three siblings: a LEVEL has its periodization (an
// ordered sequence of microciclos, per días/semana). So the navigation is:
//
//   levels home  →  click a level  →  level detail (its días-variants + the
//                                      in-editor microciclo sequence).
//
// The entered level is mirrored to ?level=<id> so it's linkable. The levels list
// (NivelesPanel) stays MOUNTED but hidden while a level is open, so its in-place
// CRUD state survives an enter→return round-trip. There is no phase entity and no
// top-level matrix — the ORDER of microciclos in a level's sequence IS the
// periodization.
//
// Inline orientation (shared primitives): a PipelineCue (this section owns the
// first & last steps of the build flow) + a dismissable IntroStrip + an InfoDot
// recall, shown on the levels home only (the level detail carries its own header).

import { useCallback, useMemo, useState } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import {
  IntroStrip,
  InfoDot,
  PipelineCue,
  useOrientationState,
  type IntroMicroStep,
} from '@/components/v2/orientacion';
import type { PipelineProgress, PipelineStepKey } from '@/lib/dashboard/v2/orientacion-types';
import type { V2PeriodizacionData, V2LevelItem } from '@/lib/dashboard/v2/periodizacion';
import type { V2SecuenciasData } from '@/lib/dashboard/v2/secuencias';
import { NivelesPanel } from './NivelesPanel';
import { LevelDetailPanel } from './LevelDetailPanel';

// This section spans the first and last steps of the build pipeline.
const PERIODIZACION_STEPS: readonly PipelineStepKey[] = ['niveles_fases', 'secuencias'];

const SECTION_KEY = 'periodizacion';

// The 3 micro-steps describe the section's role (levels → their sequence → auto).
const INTRO_STEPS: IntroMicroStep[] = [
  {
    title: 'Define tus niveles',
    body: <>El marco de tu método: los niveles clasifican al atleta. Reordénalos de menor a mayor.</>,
  },
  {
    title: 'Entra y ordena su planificación',
    body: (
      <>
        Dentro de cada nivel, encadena tus ciclos por <b>días/semana</b>. Ese orden es la
        progresión.
      </>
    ),
  },
  {
    title: 'El sistema opera solo',
    body: <>El atleta cae en su nivel y sus días, y recibe el plan. Tú lo vigilas en Hoy.</>,
  },
];

export function PeriodizacionView({
  data,
  secuencias,
  initialLevelId,
  coachKey,
  progress,
}: {
  data: V2PeriodizacionData;
  secuencias: V2SecuenciasData;
  /** Deep-link target: the level to open on load, or null for the levels home. */
  initialLevelId: string | null;
  coachKey: string;
  progress: PipelineProgress;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const orient = useOrientationState(coachKey, SECTION_KEY);

  // The level currently open (its periodization). Resolved from the deep-link on
  // load; thereafter set by NivelesPanel.onEnter (which hands the live object).
  const initialLevel = useMemo(
    () => (initialLevelId ? data.levels.find((l) => l.id === initialLevelId) ?? null : null),
    [initialLevelId, data.levels],
  );
  const [entered, setEntered] = useState<V2LevelItem | null>(initialLevel);

  const enter = useCallback(
    (level: V2LevelItem) => {
      setEntered(level);
      router.replace(`${pathname}?level=${level.id}`, { scroll: false });
    },
    [router, pathname],
  );

  const back = useCallback(() => {
    setEntered(null);
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col">
      {/* topbar + orientation — levels home only (the level detail owns its header) */}
      {!entered ? (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="v2-display text-3xl sm:text-4xl">
                <span className="text-[color:var(--v2-fg)]">Planificación</span>{' '}
                <span className="text-[color:var(--v2-muted)]">· niveles</span>
                {orient.hydrated && !orient.visible ? (
                  <InfoDot onClick={orient.recall} className="ml-2" />
                ) : null}
              </h1>
              <p className="text-sm text-[color:var(--v2-muted)]">
                El marco de tu método. Entra en un nivel para ordenar su planificación.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <PipelineCue
              coachKey={coachKey}
              sectionKey={SECTION_KEY}
              activeKeys={PERIODIZACION_STEPS}
              progress={progress}
              line={
                <>
                  Define <b>tus niveles</b> y ordena la planificación de cada uno
                </>
              }
            />
            {orient.visible ? (
              <IntroStrip
                icon="account_tree"
                line={
                  <>
                    Cada <b>nivel</b> guarda su planificación: entra y ordena su secuencia de
                    ciclos.
                  </>
                }
                steps={INTRO_STEPS}
                expanded={orient.expanded}
                onToggle={orient.toggleExpanded}
                onDismiss={orient.dismiss}
              />
            ) : null}
          </div>
        </>
      ) : null}

      {/* levels home — kept mounted (hidden when a level is open) so its CRUD state
          survives an enter→return round-trip. */}
      <div className={entered ? 'hidden' : 'mt-1'}>
        <NivelesPanel initialLevels={data.levels} onEnter={enter} />
      </div>

      {/* level detail — its días-variants + the microciclo sequence editor */}
      {entered ? (
        <div className="mt-1">
          <LevelDetailPanel level={entered} secuencias={secuencias} onBack={back} />
        </div>
      ) : null}
    </div>
  );
}
