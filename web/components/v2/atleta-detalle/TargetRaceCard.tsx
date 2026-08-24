'use client';

// CARRERA OBJETIVO — the periodization anchor on the athlete's Perfil tab. Shows
// the current target race (name + countdown + category + goal) or an honest empty
// state, and opens SetTargetRaceModal to set/change it. The detalle payload does
// NOT carry the target, so we fetch GET /api/coach/athletes/[id]/races on mount;
// after a successful set we update in place from the POST response (no re-fetch)
// while the modal also refreshes the server surfaces.

import { useEffect, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { Panel } from './parts';
import { SetTargetRaceModal } from './SetTargetRaceModal';
import {
  formatDaysUntil,
  formatRaceDate,
  formatRaceTime,
  raceCategoryLineEs,
} from '@/lib/dashboard/coach/race-labels';
import type { NextRace } from '@fahybrid/shared/schema';

export function TargetRaceCard({ athleteId }: { athleteId: string }) {
  const [target, setTarget] = useState<NextRace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/coach/athletes/${athleteId}/races`);
        const body = (await res.json().catch(() => null)) as
          | { target_race?: NextRace | null; error?: { message?: string } }
          | null;
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(body?.error?.message ?? 'No se pudo cargar la carrera objetivo.');
          return;
        }
        setTarget(body?.target_race ?? null);
      } catch {
        if (!cancelled) setLoadError('No se pudo cargar la carrera objetivo.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const actionButton = (
    <button
      type="button"
      onClick={() => setModalOpen(true)}
      className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
    >
      <MIcon name={target ? 'edit' : 'add'} size={15} />
      {target ? 'Cambiar carrera objetivo' : 'Fijar carrera objetivo'}
    </button>
  );

  const goalLabel = target ? formatRaceTime(target.goal_time_seconds) : null;
  const dateLabel = target ? formatRaceDate(target.race_date) : null;

  return (
    <>
      <Panel title="Carrera objetivo" action={actionButton}>
        {loading ? (
          <div className="flex items-center gap-2 py-1 text-xs text-[color:var(--v2-faint)]">
            <MIcon name="progress_activity" size={16} className="animate-spin" />
            Cargando…
          </div>
        ) : loadError ? (
          <p className="text-xs font-medium text-[color:var(--v2-danger)]">{loadError}</p>
        ) : target ? (
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent-text)]">
              <MIcon name="sports_score" size={22} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-bold text-[color:var(--v2-fg)]">{target.name}</span>
              <span className="text-xs text-[color:var(--v2-muted)]">
                {raceCategoryLineEs(target)}
              </span>
              <span className="v2-num flex flex-wrap items-center gap-x-1.5 text-label text-[color:var(--v2-faint)]">
                {dateLabel ? <span>{dateLabel}</span> : null}
                {dateLabel && goalLabel ? <span aria-hidden>·</span> : null}
                {goalLabel ? <span>objetivo {goalLabel}</span> : null}
              </span>
            </div>
            <Pill tone="accent" variant="soft" className="shrink-0">
              {formatDaysUntil(target.days_until)}
            </Pill>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-1">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-faint)]">
              <MIcon name="sports_score" size={22} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
                Sin carrera objetivo
              </span>
              <span className="text-xs text-[color:var(--v2-muted)]">
                Fija la carrera que ancla la planificación del plan.
              </span>
            </div>
          </div>
        )}
      </Panel>

      {modalOpen ? (
        <SetTargetRaceModal
          athleteId={athleteId}
          onClose={() => setModalOpen(false)}
          onSuccess={(resp) => setTarget(resp.target_race)}
        />
      ) : null}
    </>
  );
}
