'use client';

// CARRERAS — read-only race hub for one athlete, symmetric to the iOS athlete
// Carreras hub. Two honest sections, split in time:
//   • PRÓXIMAS · objetivos — every future objective (target + secundaria/
//     intermedia) with a live countdown + priority badge. The athlete owns
//     set/change/remove; the coach only sees the list.
//   • PASADAS · resultados — imported/finished races (raceHistoryItemSchema).
//
// Source of truth = GET /api/coach/athletes/[id]/races (same projections as the
// athlete hub). Upcoming ordered soonest-first.

import { useCallback, useEffect, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Pill, type PillTone } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { SectionHeading } from './parts';
import {
  RACE_FORMAT_LABEL,
  RACE_PRIORITY_LABEL,
  raceCategoryLineEs,
  formatRaceDate,
  formatRaceTime,
  formatClock,
} from '@/lib/dashboard/coach/race-labels';
import {
  HYROX_STATION_LABELS,
  type NextRace,
  type RaceHistoryItem,
  type RacePriority,
  type UpcomingRace,
} from '@fahybrid/shared/schema';

interface RacesResponse {
  target_race: NextRace | null;
  upcoming: UpcomingRace[];
  past: RaceHistoryItem[];
  error?: { message?: string };
}

function priorityBadge(priority: RacePriority): { tone: PillTone; label: string } {
  return {
    tone: priority === 'target' ? 'accent' : 'neutral',
    label: RACE_PRIORITY_LABEL[priority],
  };
}

export function CarrerasTab({ athleteId }: { athleteId: string }) {
  const [data, setData] = useState<RacesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/races`);
      const body = (await res.json().catch(() => null)) as RacesResponse | null;
      if (!res.ok || !body) {
        setLoadError(body?.error?.message ?? 'No se pudieron cargar las carreras.');
        return;
      }
      setData(body);
    } catch {
      setLoadError('No se pudieron cargar las carreras.');
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const upcoming = data?.upcoming ?? [];
  const past = data?.past ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <SectionHeading>Próximas · objetivos</SectionHeading>

        {loading ? (
          <LoadingRow />
        ) : loadError ? (
          <ErrorRow message={loadError} onRetry={() => void reload()} />
        ) : upcoming.length === 0 ? (
          <EmptyState
            icon="sports_score"
            title="Sin carreras objetivo"
            description="Cuando el atleta fije su carrera desde la app verás aquí la cuenta atrás y sus objetivos intermedios."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {upcoming.map((race) => (
              <UpcomingCard key={race.race_id} race={race} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeading>Pasadas · resultados</SectionHeading>

        {loading ? (
          <LoadingRow />
        ) : loadError ? null : past.length === 0 ? (
          <EmptyState
            icon="flag"
            title="Aún no hay carreras pasadas"
            description="Cuando el atleta importe su historial de HYROX (individuales y dobles) verás aquí sus resultados, percentil y splits."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {past.map((race) => (
              <PastRaceCard key={race.race_id} race={race} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UpcomingCard({ race }: { race: UpcomingRace }) {
  const badge = priorityBadge(race.priority);
  const days = Math.max(0, race.days_until ?? 0);
  const dateLine = [formatRaceDate(race.race_date), race.location]
    .filter((v): v is string => !!v)
    .join(' · ');
  const goal = formatRaceTime(race.goal_time_seconds);

  return (
    <li className="relative flex flex-col gap-2 rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4 shadow-[var(--v2-shadow-card)]">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 rounded-t-[var(--v2-r-l)]"
        style={{ background: 'var(--v2-accent)' }}
      />
      <div className="flex items-center gap-2">
        <span className="v2-micro text-[color:var(--v2-accent-text)]">Próxima carrera</span>
        <Pill tone={badge.tone} variant="soft">
          {badge.label}
        </Pill>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="v2-num text-3xl font-bold leading-none text-[color:var(--v2-accent-text)]">
          {days}
        </span>
        <span className="text-xs text-[color:var(--v2-muted)]">
          {days === 1 ? 'día' : 'días'}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-bold text-[color:var(--v2-fg)]">{race.name}</span>
        <span className="text-xs text-[color:var(--v2-muted)]">{raceCategoryLineEs(race)}</span>
        {dateLine ? (
          <span className="v2-num text-label text-[color:var(--v2-faint)]">{dateLine}</span>
        ) : null}
        {goal ? (
          <span className="mt-0.5 inline-flex items-center gap-1 text-label font-semibold text-[color:var(--v2-muted)]">
            <MIcon name="target" size={13} className="text-[color:var(--v2-accent-text)]" />
            <span className="v2-num">Objetivo {goal}</span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

function PastRaceCard({ race }: { race: RaceHistoryItem }) {
  const [expanded, setExpanded] = useState(false);

  const result = formatRaceTime(race.result_time_seconds);
  const metaLine = [formatRaceDate(race.race_date), race.location, raceCategoryLineEs(race)]
    .filter((v): v is string => !!v)
    .join(' · ');

  const topPct =
    race.percentile != null ? Math.max(1, Math.round(race.percentile * 100)) : null;
  const rankLine =
    race.overall_rank != null && race.field_size != null
      ? `#${race.overall_rank} de ${race.field_size}`
      : null;

  const teammates = race.partners.map((p) => p.name).join(', ');
  const hasSplits = race.run_splits.length > 0 || race.station_splits.length > 0;

  return (
    <li className="flex flex-col gap-2 rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4 shadow-[var(--v2-shadow-card)]">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-[color:var(--v2-fg)]">{race.name}</span>
            <Pill tone="neutral" variant="soft">
              {RACE_FORMAT_LABEL[race.format]}
            </Pill>
            {race.is_team_result ? (
              <Pill tone="info" variant="soft">
                Equipo
              </Pill>
            ) : null}
          </div>
          {metaLine ? (
            <span className="v2-num text-label text-[color:var(--v2-faint)]">{metaLine}</span>
          ) : null}
          {teammates ? (
            <span className="text-label text-[color:var(--v2-muted)]">Con {teammates}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="v2-num text-base font-bold text-[color:var(--v2-fg)]">
            {result ?? 'Sin resultado'}
          </span>
          {topPct != null ? (
            <span className="v2-num text-label font-semibold text-[color:var(--v2-accent-text)]">
              Top {topPct}%
            </span>
          ) : null}
          {rankLine ? (
            <span className="v2-num text-label text-[color:var(--v2-faint)]">{rankLine}</span>
          ) : null}
        </div>
      </div>

      {hasSplits ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name={expanded ? 'expand_less' : 'expand_more'} size={16} />
            {expanded ? 'Ocultar splits' : 'Ver splits'}
          </button>
          {expanded ? <SplitsPanel race={race} /> : null}
        </>
      ) : null}
    </li>
  );
}

function SplitsPanel({ race }: { race: RaceHistoryItem }) {
  const runTotal = formatRaceTime(race.run_total_seconds);
  const roxzone = formatClock(race.roxzone_seconds);

  return (
    <div className="mt-1 flex flex-col gap-3 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      {race.is_team_result ? (
        <span className="text-label font-medium text-[color:var(--v2-muted)]">
          Tiempos del equipo (no individuales).
        </span>
      ) : null}

      {runTotal || roxzone ? (
        <div className="flex flex-wrap gap-4">
          {runTotal ? <SummaryTile label="Run total" value={runTotal} /> : null}
          {roxzone ? <SummaryTile label="RoxZone" value={roxzone} accent /> : null}
        </div>
      ) : null}

      {race.run_splits.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="v2-micro">Carreras (1 km)</span>
          <div className="grid grid-cols-4 gap-1.5">
            {race.run_splits.map((seconds, i) => (
              <SplitCell key={`run-${i}`} label={`Run ${i + 1}`} value={formatClock(seconds)} />
            ))}
          </div>
        </div>
      ) : null}

      {race.station_splits.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="v2-micro">Estaciones</span>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {race.station_splits.map((s) => (
              <SplitCell
                key={`st-${s.index}`}
                label={HYROX_STATION_LABELS[s.index] ?? `Estación ${s.index}`}
                value={formatClock(s.seconds)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="v2-micro">{label}</span>
      <span
        className={
          accent
            ? 'v2-num text-sm font-bold text-[color:var(--v2-accent-text)]'
            : 'v2-num text-sm font-bold text-[color:var(--v2-fg)]'
        }
      >
        {value}
      </span>
    </div>
  );
}

function SplitCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--v2-r-xs)] bg-[color:var(--v2-surface)] px-2 py-1.5">
      <span className="truncate text-label text-[color:var(--v2-muted)]">{label}</span>
      <span className="v2-num shrink-0 text-label font-semibold text-[color:var(--v2-fg)]">
        {value ?? '—'}
      </span>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4 text-xs text-[color:var(--v2-faint)]">
      <MIcon name="progress_activity" size={16} className="animate-spin" />
      Cargando…
    </div>
  );
}

function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--v2-r-card)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] p-4">
      <span className="text-xs font-medium text-[color:var(--v2-danger)]">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] px-2.5 text-label font-semibold text-[color:var(--v2-danger)]"
      >
        <MIcon name="refresh" size={13} />
        Reintentar
      </button>
    </div>
  );
}
