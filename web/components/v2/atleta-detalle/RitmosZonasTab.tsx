'use client';

// RitmosZonasTab — the "Ritmos / Zonas" sub-tab of the athlete detail. It is the
// vigente face of the athlete's pace profile (UX pase 2026-06-25 §5): it READS the
// stored versioned zone profiles and renders the calculator (Pablo's viz). The
// "registrar resultado" form (coach-side) writes a new versioned profile that
// feeds it. One source of truth — the tab never recomputes a band.
//
// Empty state: an athlete with no test yet → "sin test aún · registra un resultado"
// + the form inline, so the coach can record the first test from here.

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ZoneCalculator } from './ZoneCalculator';
import { RegistrarResultadoForm } from './RegistrarResultadoForm';
import { Panel } from './parts';
import type { AthleteZoneProfile } from '@fahybrid/shared/schema/methodology-system';

export function RitmosZonasTab({
  athleteId,
  athleteName,
  profiles,
}: {
  athleteId: string;
  athleteName: string;
  profiles: AthleteZoneProfile[];
}) {
  const [recording, setRecording] = useState(false);
  const hasProfiles = profiles.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {hasProfiles ? (
        <>
          <Panel
            title="Zonas vigentes"
            action={
              recording ? null : (
                <button
                  type="button"
                  onClick={() => setRecording(true)}
                  className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] px-2 py-1 text-[11px] font-bold text-[color:var(--v2-accent)] transition-colors hover:bg-[color:var(--v2-accent-soft)]"
                >
                  <MIcon name="add" size={14} />
                  Nuevo resultado
                </button>
              )
            }
            bodyClassName="p-0 border-0 bg-transparent shadow-none"
          >
            <ZoneCalculator athleteId={athleteId} athleteName={athleteName} profiles={profiles} />
          </Panel>

          {recording ? (
            <RegistrarResultadoForm athleteId={athleteId} onDone={() => setRecording(false)} />
          ) : null}
        </>
      ) : (
        <>
          {/* Empty state — sin test aún */}
          <div className="flex flex-col items-center gap-3 rounded-[var(--v2-r-l)] border border-dashed border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-6 py-10 text-center">
            <span
              aria-hidden
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--v2-surface-2)] text-[color:var(--v2-faint)]"
            >
              <MIcon name="speed" size={26} />
            </span>
            <div>
              <p className="text-sm font-bold text-[color:var(--v2-fg)]">Sin test aún</p>
              <p className="mt-1 max-w-sm text-[12.5px] leading-snug text-[color:var(--v2-muted)]">
                Registra un resultado de test para calcular las 6 zonas de{' '}
                {athleteName.split(' ')[0]} y empezar a resolver sus ritmos en el plan.
              </p>
            </div>
          </div>

          {/* The form is always available in the empty state — record the first test here */}
          <RegistrarResultadoForm athleteId={athleteId} />
        </>
      )}
    </div>
  );
}
