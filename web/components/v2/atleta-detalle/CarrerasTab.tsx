'use client';

// CARRERAS — the coach's race hub for one athlete, symmetric to the iOS athlete
// Carreras hub. Two honest sections, split in time:
//   • PRÓXIMAS · objetivos — every future objective (target + secundaria/
//     intermedia) with a live countdown + priority badge. The coach sets/changes
//     the target (SetTargetRaceModal) and removes an objective (confirm-gated
//     DELETE /api/coach/athletes/[id]/races/target/[raceId]).
//   • PASADAS · resultados — imported/finished races (the rich
//     raceHistoryItemSchema: result, percentile/rank, doubles teammates from
//     race_partners, expandable HYROX splits).
//
// Source of truth = GET /api/coach/athletes/[id]/races, whose upcoming/past come
// from the SAME getUpcomingRaces + listAthletePastRaces projections the athlete
// hub renders, so the two surfaces never drift. Fetched on mount, re-fetched
// after a set/remove. No mock data — every state (loading/error/empty/data) is
// real.

import { useCallback, useEffect, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Pill, type PillTone } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { SectionHeading } from './parts';
import { SetTargetRaceModal } from './SetTargetRaceModal';
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

// Priority → badge tone + Spanish label (single source = RACE_PRIORITY_LABEL).
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
  const [modalOpen, setModalOpen] = useState(false);

  // Confirm-gated removal: which objective is pending + which is mid-delete.
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

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
    // Carga inicial real desde red (no hay forma de saberla en el primer
    // render): no cabe evitar el efecto, así que se silencia la regla aquí.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const handleRemove = useCallback(
    async (raceId: number) => {
      setRemovingId(raceId);
      setRemoveError(null);
      try {
        const res = await fetch(
          `/api/coach/athletes/${athleteId}/races/target/${raceId}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          setRemoveError(body?.error?.message ?? 'No se pudo quitar el objetivo.');
          return;
        }
        setPendingRemove(null);
        await reload();
      } catch {
        setRemoveError('No se pudo quitar el objetivo. Inténtalo de nuevo.');
      } finally {
        setRemovingId(null);
      }
    },
    [athleteId, reload],
  );

  const upcoming = data?.upcoming ?? [];
  const past = data?.past ?? [];

  const fijarButton = (
    <button
      type="button"
      onClick={() => setModalOpen(true)}
      className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
    >
      <MIcon name={upcoming.length > 0 ? 'add' : 'sports_score'} size={15} />
      {upcoming.length > 0 ? 'Buscar carrera' : 'Fijar carrera objetivo'}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ── PRÓXIMAS · objetivos ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionHeading action={loading ? null : fijarButton}>Próximas · objetivos</SectionHeading>

        {loading ? (
          <LoadingRow />
        ) : loadError ? (
          <ErrorRow message={loadError} onRetry={() => void reload()} />
        ) : upcoming.length === 0 ? (
          <EmptyState
            icon="sports_score"
            title="Sin carreras objetivo"
            description="Fija la carrera que ancla la periodización del plan y verás aquí la cuenta atrás."
            action={fijarButton}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {upcoming.map((race) => (
              <UpcomingCard
                key={race.race_id}
                race={race}
                pendingRemove={pendingRemove === race.race_id}
                removing={removingId === race.race_id}
                removeError={pendingRemove === race.race_id ? removeError : null}
                onRequestRemove={() => {
                  setRemoveError(null);
                  setPendingRemove(race.race_id);
                }}
                onCancelRemove={() => {
                  setRemoveError(null);
                  setPendingRemove(null);
                }}
                onConfirmRemove={() => void handleRemove(race.race_id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ── PASADAS · resultados ───────────────────────────────────────────── */}
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

      {modalOpen ? (
        <SetTargetRaceModal
          athleteId={athleteId}
          onClose={() => setModalOpen(false)}
          onSuccess={() => void reload()}
        />
      ) : null}
    </div>
  );
}

// ── PRÓXIMA · one future objective (countdown + confirm-gated remove) ──────────

function UpcomingCard({
  race,
  pendingRemove,
  removing,
  removeError,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  race: UpcomingRace;
  pendingRemove: boolean;
  removing: boolean;
  removeError: string | null;
  onRequestRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}) {
  const badge = priorityBadge(race.priority);
  const days = Math.max(0, race.days_until);
  const dateLine = [formatRaceDate(race.race_date), race.location]
    .filter((v): v is string => !!v)
    .join(' · ');
  const goal = formatRaceTime(race.goal_time_seconds);

  return (
    <li className="relative flex flex-col gap-2 rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4 shadow-[var(--v2-shadow-card)]">
      {/* top accent rule */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 rounded-t-[var(--v2-r-l)]"
        style={{ background: 'var(--v2-accent)' }}
      />
      <div className="flex items-center gap-2">
        <span className="v2-micro text-[color:var(--v2-accent)]">Próxima carrera</span>
        <Pill tone={badge.tone} variant="soft">
          {badge.label}
        </Pill>
        <span className="flex-1" />
        <button
          type="button"
          aria-label={`Quitar objetivo ${race.name}`}
          onClick={onRequestRemove}
          className="v2-focus inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-danger)]"
        >
          <MIcon name="close" size={16} />
        </button>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="v2-num text-3xl font-bold leading-none text-[color:var(--v2-accent)]">
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
            <MIcon name="target" size={13} className="text-[color:var(--v2-accent)]" />
            <span className="v2-num">Objetivo {goal}</span>
          </span>
        ) : null}
      </div>

      {pendingRemove ? (
        <div className="mt-1 flex flex-col gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2.5">
          <span className="text-label font-medium text-[color:var(--v2-fg)]">
            ¿Quitar este objetivo de la cuenta atrás?
          </span>
          {removeError ? (
            <span className="text-label font-medium text-[color:var(--v2-danger)]">
              {removeError}
            </span>
          ) : null}
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={onCancelRemove}
              disabled={removing}
              className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] px-2.5 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirmRemove}
              disabled={removing}
              className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-danger)] px-2.5 text-label font-semibold text-[color:var(--v2-bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {removing ? (
                <MIcon name="progress_activity" size={13} className="animate-spin" />
              ) : (
                <MIcon name="delete" size={13} />
              )}
              Quitar
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ── PASADA · one finished/imported race (result + percentile + splits) ─────────

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
            <span className="v2-num text-label font-semibold text-[color:var(--v2-accent)]">
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

// Expanded HYROX splits: an optional run-total / RoxZone summary, the 8 run laps,
// and the 8 stations by canonical label. Team races note that splits are the
// team's, not the athlete's individual performance.
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
            ? 'v2-num text-sm font-bold text-[color:var(--v2-accent)]'
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
