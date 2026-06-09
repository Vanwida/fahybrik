'use client';

import { useEffect, useState } from 'react';
import type { NextRace, RacePriority } from '@fahybrid/shared/schema';
import type { RaceListItem } from '@/lib/races/coach-races';
import {
  RACE_PRIORITY_LABEL,
  formatDaysUntil,
  formatRaceTime,
  raceCategoryLineEs,
} from '@/lib/dashboard/coach/race-labels';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

interface AthleteRacesPayload {
  athlete_id: string;
  target_race: NextRace | null;
  next_race: NextRace | null;
  races: RaceListItem[];
}

interface AthleteRaceSectionProps {
  athleteId: string;
}

type LoadState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; payload: AthleteRacesPayload };

// Priority chip tones — target is the accent (the goal), the rest are muted so
// the target visually dominates the calendar. Token-driven, color-mix tints.
const PRIORITY_TONE: Record<RacePriority, string> = {
  target:
    'border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--accent)]',
  secondary:
    'border-[color:color-mix(in_srgb,var(--tertiary)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--tertiary)_12%,transparent)] text-[color:var(--tertiary)]',
  tune_up:
    'border-[color:var(--border-subtle)] bg-[color:var(--surface-container-high)] text-[color:var(--text-muted)]',
};

function formatRaceDateEs(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function PriorityBadge({ priority }: { priority: RacePriority }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--r-pill)] border px-2 py-0.5',
        'text-[9px] font-bold uppercase tracking-[0.08em]',
        PRIORITY_TONE[priority],
      )}
    >
      {RACE_PRIORITY_LABEL[priority]}
    </span>
  );
}

export function AthleteRaceSection({ athleteId }: AthleteRaceSectionProps) {
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // setState only ever fires from the async callbacks below (never synchronously
    // in the effect body), so switching athletes shows the previous data until the
    // new fetch resolves — acceptable, and avoids cascading renders.
    (async () => {
      try {
        const res = await fetch(`/api/coach/athletes/${athleteId}/races`, {
          credentials: 'include',
        });
        if (!res.ok) {
          if (!cancelled) setLoad({ state: 'error' });
          return;
        }
        const payload = (await res.json()) as AthleteRacesPayload;
        if (!cancelled) setLoad({ state: 'ready', payload });
      } catch {
        if (!cancelled) setLoad({ state: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  return (
    <section aria-labelledby="race-section-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-2">
        <h2
          id="race-section-heading"
          className="font-heading uppercase text-[color:var(--fg)]"
        >
          Carreras
        </h2>
        <MIcon name="flag" size={20} filled className="text-[color:var(--text-muted)]" />
      </div>

      {load.state === 'loading' ? (
        <div
          className="h-28 animate-pulse rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]"
          aria-hidden
        />
      ) : load.state === 'error' ? (
        <p className="rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-6 text-sm text-[color:var(--text-muted)]">
          No se pudieron cargar las carreras.
        </p>
      ) : (
        <RaceContent payload={load.payload} />
      )}
    </section>
  );
}

function RaceContent({ payload }: { payload: AthleteRacesPayload }) {
  const { target_race, races } = payload;
  // Upcoming races for the calendar (the full list includes past/completed). The
  // calendar shows what's ahead so the coach sees goal vs tune-ups.
  const upcoming = races.filter((r) => r.status !== 'completed');

  if (target_race == null && upcoming.length === 0) {
    return (
      <div className="rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-8 text-center">
        <MIcon name="event_busy" size={28} className="text-[color:var(--text-muted)]" />
        <p className="mt-2 font-heading text-[color:var(--fg)]">Sin carreras programadas</p>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">
          Aún no hay ninguna carrera registrada para este atleta.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {target_race ? <TargetRaceCard race={target_race} /> : null}

      {upcoming.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            Calendario de carreras
          </p>
          <ul className="flex flex-col gap-2">
            {upcoming.map((race, i) => (
              <RaceCalendarRow key={race.id} race={race} index={i} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TargetRaceCard({ race }: { race: NextRace }) {
  const goal = formatRaceTime(race.goal_time_seconds);
  return (
    <article
      className={cn(
        'card-elevated stagger-in relative overflow-hidden p-5',
        'border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))]',
        'bg-[color:color-mix(in_srgb,var(--accent)_6%,var(--surface-card))]',
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] blur-[44px]"
      />
      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <PriorityBadge priority="target" />
              <span className="micro-label">Carrera objetivo</span>
            </div>
            <h3 className="truncate font-display text-2xl font-black italic leading-tight text-[color:var(--fg)]">
              {race.name}
            </h3>
            <p className="mt-0.5 text-sm text-[color:var(--text-muted)]">
              {raceCategoryLineEs(race)}
            </p>
          </div>
          <div className="metric-readout metric-readout--accent shrink-0 items-end text-right">
            <span className="metric-readout__value metric-readout__value--lg">
              {race.days_until <= 0 ? '¡hoy!' : race.days_until}
            </span>
            {race.days_until > 0 ? (
              <span className="metric-readout__label">
                {race.days_until === 1 ? 'día' : 'días'} para la carrera
              </span>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 border-t border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border-subtle))] pt-3 sm:grid-cols-3">
          <RaceFact icon="calendar_month" label="Fecha" value={formatRaceDateEs(race.race_date)} />
          <RaceFact
            icon="schedule"
            label="Cuenta atrás"
            value={formatDaysUntil(race.days_until)}
          />
          {race.location ? (
            <RaceFact icon="location_on" label="Lugar" value={race.location} />
          ) : null}
          {goal ? <RaceFact icon="timer" label="Objetivo" value={goal} /> : null}
        </dl>
      </div>
    </article>
  );
}

function RaceFact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="mb-0.5 flex items-center gap-1 micro-label tracking-[0.08em]">
        <MIcon name={icon} size={13} />
        {label}
      </dt>
      <dd className="metric-num truncate text-sm font-semibold text-[color:var(--fg)]">{value}</dd>
    </div>
  );
}

function RaceCalendarRow({ race, index = 0 }: { race: RaceListItem; index?: number }) {
  const goal = formatRaceTime(race.goal_time_seconds);
  return (
    <li
      style={{ '--stagger-i': index } as React.CSSProperties}
      className="stagger-in card-elevated flex items-center justify-between gap-3 px-4 py-3"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={race.priority} />
          <h4 className="truncate font-display text-base font-black italic text-[color:var(--fg)]">
            {race.name}
          </h4>
        </div>
        <p className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
          {raceCategoryLineEs(race)}
          {race.location ? ` · ${race.location}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="metric-num text-xs font-semibold text-[color:var(--fg)]">
          {formatRaceDateEs(race.race_date)}
        </p>
        {goal ? (
          <p className="metric-num mt-0.5 text-[11px] text-[color:var(--text-muted)]">
            Obj. {goal}
          </p>
        ) : null}
      </div>
    </li>
  );
}
