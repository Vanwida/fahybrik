// CARD 1 — EVENTO OBJETIVO (A). Anchors the plan; the macrocycle is built
// backwards from this date. Behavior preserved from IntakeDecision:
//   - valid future target_event  → confirmed event card (name/date/division +
//     countdown) with a subtle "cambiar" affordance that opens the picker.
//   - no valid event             → surface the athlete's onboarding race as a
//     suggestion. When the catalog loads, try to MATCH that race to a real
//     event (name case-insensitive + iso date). Matched → PRIMARY "Usar esta
//     carrera" sets that event id. No match → the existing <select> picker +
//     a muted "not in catalog" note and the create-in-Eventos hint.
// NEVER fabricates an event id — selectedEventId is only ever a real catalog id.

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/dashboard/MIcon';
import { StatusChip } from '@/components/dashboard/ui';
import type { IntakeProfile } from '@/lib/coach/intake';
import { DecisionCard } from '../ui/DecisionCard';

export interface EventOption {
  event_id: string;
  name: string;
  start_date: string;
  division: string | null;
  is_past: boolean;
}

/** The onboarding race the athlete declared at sign-up (A-event). */
export interface OnboardingRace {
  name: string;
  iso_date: string;
  division: string | null;
}

function countdownLabel(daysToEvent: number, isInPast: boolean): string {
  if (isInPast) return 'fecha pasada';
  if (daysToEvent <= 0) return 'hoy';
  return `faltan ${daysToEvent} día${daysToEvent === 1 ? '' : 's'}`;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function EventCard({
  profile,
  onboardingRace,
  selectedEventId,
  onSelect,
  events,
  eventsLoading,
  onLoadEvents,
}: {
  profile: IntakeProfile;
  /** Onboarding race surfaced when no valid future target_event exists. */
  onboardingRace: OnboardingRace | null;
  selectedEventId: string;
  onSelect: (eventId: string) => void;
  events: EventOption[] | null;
  eventsLoading: boolean;
  onLoadEvents: () => void;
}) {
  const { target_event } = profile;
  const hasValidTarget = Boolean(target_event && !target_event.is_in_past);

  // When there's a confirmed target, "cambiar" reveals the picker in place.
  const [picking, setPicking] = useState(false);
  const showConfirmed = hasValidTarget && !picking;

  // Match the onboarding race to a real catalog event (name + iso date).
  const matchedEvent = useMemo<EventOption | null>(() => {
    if (!onboardingRace || !events) return null;
    return (
      events.find(
        (e) =>
          !e.is_past &&
          normalize(e.name) === normalize(onboardingRace.name) &&
          e.start_date === onboardingRace.iso_date,
      ) ?? null
    );
  }, [onboardingRace, events]);

  const gateOpen = selectedEventId === '';

  const eyebrow = (
    <>
      <span className="micro-label">Ancla el plan</span>
      {gateOpen ? <StatusChip tier="error" label="Gate" icon="block" /> : null}
    </>
  );

  return (
    <DecisionCard
      step={1}
      title="Evento objetivo (A)"
      eyebrow={eyebrow}
      subline="El plan se construye hacia atrás desde esta fecha."
      stripe={gateOpen}
    >
      {showConfirmed && target_event ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] px-4 py-3">
          <div className="flex items-center gap-3">
            <MIcon name="flag" size={20} filled className="text-[color:var(--text-muted)]" />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[color:var(--fg)]">
                {target_event.name}
              </span>
              <span className="text-[12.5px] text-[color:var(--text-muted)]">
                <span className="metric-num">{target_event.iso_date}</span>
                {target_event.division ? ` · ${target_event.division}` : ''}
                {' · '}
                {countdownLabel(target_event.days_to_event, target_event.is_in_past)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPicking(true);
              onLoadEvents();
            }}
            className="focus-ring inline-flex items-center gap-1 rounded-[var(--r-s)] px-2 py-1 text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
          >
            <MIcon name="edit" size={14} aria-hidden />
            cambiar
          </button>
        </div>
      ) : (
        <EventChooser
          onboardingRace={onboardingRace}
          matchedEvent={matchedEvent}
          targetInPast={Boolean(target_event && target_event.is_in_past)}
          selectedEventId={selectedEventId}
          onSelect={onSelect}
          events={events}
          eventsLoading={eventsLoading}
          onLoadEvents={onLoadEvents}
        />
      )}

      {gateOpen ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs italic text-[color:var(--text-muted)]">
          <MIcon name="error" size={14} className="text-[color:var(--danger)]" />
          Aún no anclado — elige una carrera para poder asignar.
        </p>
      ) : null}
    </DecisionCard>
  );
}

function EventChooser({
  onboardingRace,
  matchedEvent,
  targetInPast,
  selectedEventId,
  onSelect,
  events,
  eventsLoading,
  onLoadEvents,
}: {
  onboardingRace: OnboardingRace | null;
  matchedEvent: EventOption | null;
  targetInPast: boolean;
  selectedEventId: string;
  onSelect: (eventId: string) => void;
  events: EventOption[] | null;
  eventsLoading: boolean;
  onLoadEvents: () => void;
}) {
  const matchedSelected = matchedEvent != null && selectedEventId === matchedEvent.event_id;
  const noCatalogMatch = events != null && onboardingRace != null && matchedEvent == null;

  return (
    <div className="rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] p-3.5">
      {onboardingRace ? (
        <div className="flex flex-wrap items-center gap-3">
          <MIcon name="flag" size={20} className="text-[color:var(--text-muted)]" />
          <span className="text-[12.5px] text-[color:var(--text-muted)]">
            {targetInPast
              ? 'El A-event del alta está en el pasado:'
              : 'El atleta indicó en el alta:'}
          </span>
          <div className="flex min-w-[200px] flex-1 items-baseline gap-2">
            <span className="text-sm font-bold text-[color:var(--fg)]">
              {onboardingRace.name}
            </span>
            <span aria-hidden className="text-[color:var(--text-muted)] opacity-50">·</span>
            <span className="metric-num text-[12.5px] text-[color:var(--text-muted)]">
              {onboardingRace.iso_date}
            </span>
            {onboardingRace.division ? (
              <>
                <span aria-hidden className="text-[color:var(--text-muted)] opacity-50">·</span>
                <span className="text-[12.5px] text-[color:var(--text-muted)]">
                  {onboardingRace.division}
                </span>
              </>
            ) : null}
          </div>
          {matchedEvent ? (
            <button
              type="button"
              onClick={() => onSelect(matchedEvent.event_id)}
              aria-pressed={matchedSelected}
              className={cn(
                'focus-ring inline-flex h-8 items-center gap-1.5 rounded-[var(--r-m)] px-3.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
                matchedSelected
                  ? 'border border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface-card))] text-[color:var(--accent)]'
                  : 'bg-[color:var(--accent)] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]',
              )}
            >
              <MIcon name="check" size={16} aria-hidden />
              {matchedSelected ? 'Anclada' : 'Usar esta carrera'}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mb-3 text-[12.5px] text-[color:var(--text-muted)]">
          {targetInPast
            ? 'El A-event del alta está en el pasado. Elige un evento futuro del catálogo.'
            : 'El atleta no tiene un A-event válido. Selecciona uno del catálogo para asignar el plan.'}
        </p>
      )}

      {/* Picker: always available as the fallback (and the "o elige del
          catálogo" affordance when a matched race exists). */}
      <div className={onboardingRace ? 'mt-3' : undefined}>
        {onboardingRace && matchedEvent ? (
          <p className="mb-2 text-xs text-[color:var(--text-muted)]">¿No es la correcta?</p>
        ) : null}
        <label className="block">
          <span className="sr-only">Evento objetivo A</span>
          <select
            value={selectedEventId}
            onFocus={onLoadEvents}
            onChange={(e) => onSelect(e.target.value)}
            aria-label="Evento objetivo A"
            className="focus-ring w-full rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm text-[color:var(--fg)]"
          >
            <option value="">
              {eventsLoading ? 'Cargando eventos…' : '— Elige un evento del catálogo —'}
            </option>
            {(events ?? []).map((ev) => (
              <option key={ev.event_id} value={ev.event_id}>
                {ev.name} · {ev.start_date}
                {ev.division ? ` · ${ev.division}` : ''}
              </option>
            ))}
          </select>
        </label>

        {noCatalogMatch ? (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">
            Esa carrera no está en el catálogo todavía. Elige una de la lista o créala
            en Eventos.
          </p>
        ) : events != null && events.length === 0 ? (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">
            No hay eventos futuros en el catálogo. Crea uno en Eventos antes de cerrar
            el intake.
          </p>
        ) : null}
      </div>
    </div>
  );
}
