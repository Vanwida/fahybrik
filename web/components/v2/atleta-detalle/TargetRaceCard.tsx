'use client';

// CARRERA OBJETIVO — read-only periodization anchor on the athlete's Perfil tab.
// The athlete owns target selection; the coach sees name + countdown + category + goal.
// Source: GET /api/coach/athletes/[id]/races → target_race.

import { useEffect, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { Panel } from './parts';
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

  const goalLabel = target ? formatRaceTime(target.goal_time_seconds) : null;
  const dateLabel = target ? formatRaceDate(target.race_date) : null;

  return (
    <Panel title="Carrera objetivo">
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
              El atleta la fija desde su app; aquí verás la cuenta atrás cuando la elija.
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}
