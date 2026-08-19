'use client';

// FIJAR CARRERA OBJETIVO — the coach picks one of their athletes' target race
// from the shared events catalog. Two real backend calls:
//   1. GET  /api/coach/races/calendar              → the catalog (future events,
//                                                     incl. ones hidden to athletes).
//   2. POST /api/coach/athletes/{id}/races/target  → writes the target races row.
// The catalog event only supplies the venue (name/date/location, derived
// server-side); the coach chooses the orthogonal participation attributes
// (formato × división × categoría) + an optional goal time. No stubs: every state
// below (loading / empty / error / success) is real. Mirrors AddAthleteModal's
// dialog shell, scrim, focus rings and soft-error contract.

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import {
  RACE_FORMAT_LABEL,
  RACE_DIVISION_LABEL,
  RACE_GENDER_LABEL,
  formatRaceDate,
  parseRaceTime,
} from '@/lib/dashboard/coach/race-labels';
import type {
  AthleteTargetRaceInput,
  RaceCalendarEvent,
  RaceDivision,
  RaceFormat,
  RaceGender,
  SetTargetRaceResponse,
} from '@fahybrid/shared/schema';
import { cn } from '@/lib/utils';

// The three orthogonal participation axes. Labels come from the shared race-label
// maps (single source of truth) so the modal never forks the vocabulary.
const FORMAT_OPTIONS: ReadonlyArray<{ value: RaceFormat; label: string }> = [
  { value: 'singles', label: RACE_FORMAT_LABEL.singles },
  { value: 'doubles', label: RACE_FORMAT_LABEL.doubles },
  { value: 'relay', label: RACE_FORMAT_LABEL.relay },
];
const DIVISION_OPTIONS: ReadonlyArray<{ value: RaceDivision; label: string }> = [
  { value: 'open', label: RACE_DIVISION_LABEL.open },
  { value: 'pro', label: RACE_DIVISION_LABEL.pro },
  { value: 'elite', label: RACE_DIVISION_LABEL.elite },
];
const GENDER_OPTIONS: ReadonlyArray<{ value: RaceGender; label: string }> = [
  { value: 'men', label: RACE_GENDER_LABEL.men },
  { value: 'women', label: RACE_GENDER_LABEL.women },
  { value: 'mixed', label: RACE_GENDER_LABEL.mixed },
];

// The endpoint accepts goal times up to 10h (athleteTargetRaceInput max=36000).
const GOAL_TIME_MAX_SECONDS = 36_000;
const SERIES_ALL = 'all';

/** Catalog row date: confirmed → "14 nov 2026", else honest placeholder. */
function eventDateLabel(ev: RaceCalendarEvent): string {
  if (ev.is_tentative) return 'Fecha por confirmar';
  return formatRaceDate(ev.start_date) ?? 'Fecha por confirmar';
}

export function SetTargetRaceModal({
  athleteId,
  onClose,
  onSuccess,
}: {
  athleteId: string;
  onClose: () => void;
  /** Receives the written target so the caller can update its view in place. */
  onSuccess?: (resp: SetTargetRaceResponse) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [events, setEvents] = useState<RaceCalendarEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [series, setSeries] = useState<string>(SERIES_ALL);
  const [selected, setSelected] = useState<RaceCalendarEvent | null>(null);

  const [format, setFormat] = useState<RaceFormat>('singles');
  const [division, setDivision] = useState<RaceDivision>('open');
  const [gender, setGender] = useState<RaceGender>('men');
  const [goalRaw, setGoalRaw] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load the catalog once on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/coach/races/calendar');
        const body = (await res.json().catch(() => null)) as
          | { events?: RaceCalendarEvent[]; error?: { message?: string } }
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.events) {
          setLoadError(body?.error?.message ?? 'No se pudo cargar el calendario de carreras.');
          setEvents([]);
          return;
        }
        setEvents(body.events);
      } catch {
        if (!cancelled) {
          setLoadError('No se pudo cargar el calendario de carreras.');
          setEvents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Distinct series present in the catalog → the optional family filter (only
  // worth showing when there's more than one).
  const seriesOptions = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events ?? []) if (ev.series) set.add(ev.series);
    const sorted = [...set].sort();
    if (sorted.length < 2) return null;
    return [
      { value: SERIES_ALL, label: 'Todas' },
      ...sorted.map((s) => ({ value: s, label: s.toUpperCase() })),
    ];
  }, [events]);

  // Client-side filter (series + text) + soonest-first sort. ISO dates sort
  // lexicographically so a plain string compare is correct; undated events
  // (start_date null, e.g. tentative venues) sort last.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (events ?? [])
      .filter((ev) => series === SERIES_ALL || ev.series === series)
      .filter((ev) => {
        if (!q) return true;
        return (
          ev.name.toLowerCase().includes(q) ||
          (ev.location?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        if (a.start_date == null) return b.start_date == null ? 0 : 1;
        if (b.start_date == null) return -1;
        return a.start_date.localeCompare(b.start_date);
      });
  }, [events, query, series]);

  const goalTrimmed = goalRaw.trim();
  const goalSeconds = goalTrimmed === '' ? null : parseRaceTime(goalRaw);
  const goalInvalid =
    goalTrimmed !== '' && (goalSeconds === null || goalSeconds > GOAL_TIME_MAX_SECONDS);

  const canSubmit = selected !== null && !goalInvalid && !submitting;

  function pick(ev: RaceCalendarEvent) {
    setSelected(ev);
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (!canSubmit || !selected) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: AthleteTargetRaceInput = {
        event_id: Number(selected.event_id),
        format,
        division,
        gender_category: gender,
        goal_time_seconds: goalSeconds,
      };
      const res = await fetch(`/api/coach/athletes/${athleteId}/races/target`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as
        | (SetTargetRaceResponse & { error?: { message?: string } })
        | { error?: { message?: string } }
        | null;
      if (!res.ok) {
        setSubmitError(
          (body as { error?: { message?: string } } | null)?.error?.message ??
            'No se pudo fijar la carrera objetivo.',
        );
        return;
      }
      onSuccess?.(body as SetTargetRaceResponse);
      startTransition(() => router.refresh());
      onClose();
    } catch {
      setSubmitError('No se pudo fijar la carrera objetivo. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = cn(
    'v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm',
    'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
    'focus:border-[color:var(--v2-border-strong)]',
  );

  const divisionHint =
    selected && selected.division_options.length > 0
      ? selected.division_options.join(' · ')
      : null;

  return (
    <ModalPortal onEscape={onClose}>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Fijar carrera objetivo"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />

      {/* Dialog */}
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--v2-border)] p-5">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Carrera objetivo</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            disabled={isPending}
            className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          {/* Search */}
          <label className="flex flex-col gap-1.5">
            <span className="v2-micro">Buscar evento</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--v2-faint)]">
                <MIcon name="search" size={18} />
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre o ciudad…"
                autoFocus
                className={cn(inputCls, 'pl-9')}
                aria-label="Buscar evento por nombre o ciudad"
              />
            </div>
          </label>

          {/* Series filter (only when the catalog spans >1 family) */}
          {seriesOptions ? (
            <SegmentedControl
              options={seriesOptions}
              value={series}
              onChange={setSeries}
              size="sm"
              ariaLabel="Filtrar por serie"
            />
          ) : null}

          {/* Event list */}
          {events === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-[color:var(--v2-faint)]">
              <MIcon name="progress_activity" size={16} className="animate-spin" />
              Cargando calendario…
            </div>
          ) : loadError ? (
            <p className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] px-3 py-2 text-xs text-[color:var(--v2-danger)]">
              {loadError}
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-[color:var(--v2-faint)]">
              {query.trim() || series !== SERIES_ALL
                ? 'Ningún evento coincide con el filtro.'
                : 'No hay eventos futuros en el calendario.'}
            </p>
          ) : (
            <ul
              className="flex max-h-[34vh] flex-col gap-1.5 overflow-y-auto"
              aria-label="Eventos del calendario"
            >
              {filtered.map((ev) => {
                const active = selected?.event_id === ev.event_id;
                return (
                  <li key={ev.event_id}>
                    <button
                      type="button"
                      onClick={() => pick(ev)}
                      aria-pressed={active}
                      className={cn(
                        'v2-focus flex w-full items-center gap-3 rounded-[var(--v2-r-m)] border px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
                          : 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--v2-r-s)]',
                          active
                            ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                            : 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)]',
                        )}
                      >
                        <MIcon name="sports_score" size={18} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
                          {ev.name}
                        </span>
                        <span className="truncate text-label text-[color:var(--v2-muted)]">
                          {ev.location ? `${ev.location} · ` : ''}
                          {eventDateLabel(ev)}
                        </span>
                      </span>
                      {active ? (
                        <MIcon
                          name="check_circle"
                          size={18}
                          className="shrink-0 text-[color:var(--v2-accent)]"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Participation attributes — revealed once an event is chosen */}
          {selected ? (
            <div className="flex flex-col gap-3.5 border-t border-[color:var(--v2-border)] pt-4">
              <div className="flex flex-col gap-1.5">
                <span className="v2-micro">Formato</span>
                <SegmentedControl
                  options={FORMAT_OPTIONS}
                  value={format}
                  onChange={setFormat}
                  ariaLabel="Formato"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="v2-micro">División</span>
                <SegmentedControl
                  options={DIVISION_OPTIONS}
                  value={division}
                  onChange={setDivision}
                  ariaLabel="División"
                />
                {divisionHint ? (
                  <span className="text-label text-[color:var(--v2-faint)]">
                    Divisiones del evento: {divisionHint}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="v2-micro">Categoría</span>
                <SegmentedControl
                  options={GENDER_OPTIONS}
                  value={gender}
                  onChange={setGender}
                  ariaLabel="Categoría"
                />
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="v2-micro">Tiempo objetivo · opcional</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={goalRaw}
                  onChange={(e) => setGoalRaw(e.target.value)}
                  placeholder="h:mm:ss (p. ej. 1:15:30)"
                  className={cn(inputCls, 'v2-num', goalInvalid && 'border-[color:var(--v2-danger)]')}
                  aria-invalid={goalInvalid}
                  aria-label="Tiempo objetivo en formato h:mm:ss"
                />
                {goalInvalid ? (
                  <span className="text-label text-[color:var(--v2-danger)]">
                    Formato no válido. Usa h:mm:ss o mm:ss (máx. 10:00:00).
                  </span>
                ) : null}
              </label>
            </div>
          ) : null}

          {submitError ? (
            <p className="text-xs font-medium text-[color:var(--v2-danger)]">{submitError}</p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[color:var(--v2-border)] p-5">
          <button
            type="button"
            onClick={onClose}
            className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <MIcon name="progress_activity" size={16} className="animate-spin" />
                Fijando…
              </>
            ) : (
              <>
                <MIcon name="sports_score" size={16} />
                Fijar carrera objetivo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
