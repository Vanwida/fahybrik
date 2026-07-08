'use client';

// FAHYBRID — public booking picker (funnel #2). Reusable across the standalone
// public page (/{locale}/cita/{token}) and the onboarding final screen.
//
// The token IS the credential: on mount it fetches the public booking context
// and then renders exactly one of four honest states — an existing
// appointment's status, a live slot picker, a booked-confirmation, or the
// "Pablo te escribirá" fallback (NEVER an empty calendar). All times are
// Europe/Madrid, formatted for humans with Intl es-ES. Backend contract is
// fixed; this only reads/writes it.
//
// #40 — the lead first chooses HOW: 📹 Videollamada (Google Meet) or 📍
// Presencial (en el box). A segmented control at the top drives which schedule's
// slots are shown; switching re-fetches the context for that modality and the
// booking POST carries the choice. Copy adapts per modality (link vs address).

import { useCallback, useEffect, useState } from 'react';
import { ArrowIcon } from '@/components/onboarding/icons';
import './citas.css';

// ── Contract types (mirror /api/citas/context + /api/citas/book) ──────────────
type AppointmentStatus =
  | 'pendiente'
  | 'aceptada'
  | 'rechazada'
  | 'cancelada'
  | 'completada'
  | 'no_show';

// How the call happens. Drives which schedule's slots the context returns and
// which copy the confirmation shows. Default is video (matches the API's
// no-param default).
type Modality = 'video' | 'presencial';
const DEFAULT_MODALITY: Modality = 'video';

interface Appointment {
  id: string;
  requested_start: string; // ISO instant
  duration_minutes: number;
  status: AppointmentStatus;
  meet_link: string | null;
}
interface Slot {
  start: string; // ISO instant
  ms: number;
  time: string; // 'HH:MM' (Europe/Madrid)
}
interface DaySlots {
  date: string; // 'YYYY-MM-DD'
  weekday: number; // 0=Sun..6=Sat
  slots: Slot[];
}
interface BookingContext {
  nombre: string;
  active_appointment: Appointment | null;
  slots: DaySlots[];
  // #18: coach at capacity and this lead is on the waitlist (not yet released) →
  // show the "en lista de espera" state instead of any slots. A released lead
  // comes back with waitlisted=false → normal booking, no change.
  waitlisted: boolean;
}

type LoadPhase = 'loading' | 'ready' | 'error';

interface BookingSlotPickerProps {
  token: string;
  variant?: 'onboarding' | 'public';
  className?: string;
}

// ── Modality-dependent copy (single source; no strings scattered inline) ──────
const MEET_CTA = 'Unirme a la videollamada';
// Shown once a call is booked. video → the Meet link is emailed; presencial →
// the box address is emailed (there is no Meet link for a presencial session).
const VIDEO_LINK_NOTE = 'Te hemos enviado el email con el enlace de la videollamada.';
const ADDRESS_NOTE = 'Te hemos enviado el email con la dirección del box.';
// Reassurance under the "¿Reservar el …?" confirmation, before they confirm.
const CONFIRM_NOTE: Record<Modality, string> = {
  video: 'Reservas y listo — te llega el email con el enlace de la videollamada.',
  presencial: 'Reservas tu sesión presencial — te llega el email con la dirección del box.',
};

// ── Time formatting — all human-facing times are Europe/Madrid ────────────────
const TZ = 'Europe/Madrid';
const LOCALE = 'es-ES';

function partsOf(iso: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...opts }).formatToParts(new Date(iso));
}
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Short day heading, e.g. "Mié 9 jul". */
function formatDayLabel(iso: string): string {
  const p = partsOf(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const get = (type: string) => (p.find((x) => x.type === type)?.value ?? '').replace('.', '');
  return `${capitalize(get('weekday'))} ${get('day')} ${get('month')}`;
}

/** Long, human date + time, e.g. "miércoles 9 de julio a las 18:00". */
function formatFecha(iso: string): string {
  const p = partsOf(iso, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} de ${get('month')} a las ${get('hour')}:${get('minute')}`;
}

// ── Network (pure — returns data, never touches React state) ──────────────────
/**
 * GET the public booking context for a given modality. The returned `slots` are
 * the bookable slots FOR THAT MODALITY. Returns null on any non-OK / network
 * error.
 */
async function fetchBookingContext(
  token: string,
  modality: Modality,
): Promise<BookingContext | null> {
  try {
    const res = await fetch(
      `/api/citas/context/${encodeURIComponent(token)}?modality=${modality}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    return (await res.json()) as BookingContext;
  } catch {
    return null;
  }
}

// ── Small shared piece: the "join the call" button (video, with a meet link) ──
function MeetButton({ href }: { href: string }) {
  return (
    <div className="bk-actions">
      <a className="bk-btn" href={href} target="_blank" rel="noopener noreferrer">
        {MEET_CTA} <ArrowIcon />
      </a>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function BookingSlotPicker({ token, variant = 'public', className }: BookingSlotPickerProps) {
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [ctx, setCtx] = useState<BookingContext | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [posting, setPosting] = useState(false);
  const [booked, setBooked] = useState<Appointment | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  // The chosen call type. `switching` is true only while re-fetching after the
  // lead toggles modality — it keeps the segmented control up and shows an
  // inline "Cargando huecos…" without dropping to the bare initial-load state.
  const [modality, setModality] = useState<Modality>(DEFAULT_MODALITY);
  const [switching, setSwitching] = useState(false);
  // The appointment/booked objects don't carry modality, so we remember what the
  // lead chose to word the just-booked confirmation correctly.
  const [bookedModality, setBookedModality] = useState<Modality>(DEFAULT_MODALITY);

  // Apply a fetched context (or an error) to state. Never called synchronously
  // from an effect body — only after an await / from an event handler.
  const applyContext = useCallback((data: BookingContext | null) => {
    if (data) {
      setCtx(data);
      setPhase('ready');
    } else {
      setPhase('error');
    }
  }, []);

  // Load (and reload) the context. Keyed on the token AND the chosen modality:
  // toggling modality changes `modality`, which re-runs this to fetch that
  // schedule's slots. setState happens AFTER the await (the codebase idiom) so
  // it never triggers a synchronous-setState-in-effect.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchBookingContext(token, modality);
      if (cancelled) return;
      applyContext(data);
      setSwitching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, modality, applyContext]);

  // User-triggered retry from the error state (re-fetches the current modality).
  const retry = async () => {
    setPhase('loading');
    applyContext(await fetchBookingContext(token, modality));
  };

  // Switch modality → the effect above re-fetches that schedule's slots. We drop
  // any pending selection/error and flag `switching` so the toggle stays and an
  // inline loader shows during the refetch.
  const switchModality = (next: Modality) => {
    if (next === modality || switching || posting) return;
    setSelected(null);
    setBookError(null);
    setSwitching(true);
    setModality(next);
  };

  const chooseSlot = (slot: Slot) => {
    setBookError(null);
    setSelected(slot);
  };

  const confirmBooking = async () => {
    if (!selected || posting) return;
    setPosting(true);
    setBookError(null);
    try {
      const res = await fetch('/api/citas/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, start: selected.start, website: '', modality }),
      });
      if (res.status === 201) {
        const data = (await res.json()) as { ok: true; appointment: Appointment };
        setBookedModality(modality);
        setBooked(data.appointment);
        setSelected(null);
        return;
      }
      // 409 (slot taken / already booked) or 404 / other: surface the reason and
      // re-fetch so the calendar reflects reality (slot gone, or now has an appt).
      let message = 'No pudimos reservar ese hueco. Elige otro, por favor.';
      try {
        const data = (await res.json()) as { error?: { message?: string } };
        if (data?.error?.message) message = data.error.message;
      } catch {
        // keep the default message
      }
      setSelected(null);
      setBookError(message);
      // Re-sync availability without a jarring loading flash (picker stays up).
      applyContext(await fetchBookingContext(token, modality));
    } catch {
      setBookError('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setPosting(false);
    }
  };

  const rootClass = ['bk', `bk--${variant}`, className].filter(Boolean).join(' ');

  // The modality choice only makes sense while the lead is actually picking a
  // slot — never once they have a cita (booked / active) or are waitlisted, and
  // not during the very first load (we don't yet know which of those they're in).
  const showToggle =
    phase === 'ready' && !booked && !ctx?.waitlisted && !ctx?.active_appointment;

  // ── Render: exactly one honest state ───────────────────────────────────────
  let content: React.ReactNode;

  if (phase === 'loading') {
    content = (
      <p className="bk-loading" role="status">
        Cargando huecos…
      </p>
    );
  } else if (phase === 'error') {
    content = (
      <div>
        <p className="bk-error" role="alert">
          No pudimos cargar los huecos disponibles.
        </p>
        <button type="button" className="bk-btn bk-btn--ghost" onClick={() => void retry()}>
          Reintentar
        </button>
      </div>
    );
  } else if (switching) {
    // Refetching after a modality toggle — the segmented control stays above this.
    content = (
      <p className="bk-loading" role="status">
        Cargando huecos…
      </p>
    );
  } else if (booked) {
    // Just booked in this session — auto-accepted, so it's confirmed on the spot.
    // We know the modality (from state) → word it exactly.
    content = (
      <div className="bk-card bk-card--accent" role="status">
        <span className="bk-card-eyebrow">
          <span className="bk-dot" aria-hidden="true" /> Cita confirmada
        </span>
        <p className="bk-card-title">
          Cita confirmada: <strong>{formatFecha(booked.requested_start)}</strong>.
        </p>
        {bookedModality === 'presencial' ? (
          <p className="bk-card-note">{ADDRESS_NOTE}</p>
        ) : booked.meet_link ? (
          <MeetButton href={booked.meet_link} />
        ) : (
          <p className="bk-card-note">{VIDEO_LINK_NOTE}</p>
        )}
      </div>
    );
  } else if (ctx?.waitlisted) {
    // On the waitlist and not yet released — no slots to pick. Same exclusive,
    // honest framing as the onboarding waitlist screen (scarcity, not rejection).
    content = (
      <div className="bk-card">
        <span className="bk-card-eyebrow">
          <span className="bk-dot" aria-hidden="true" /> Lista de espera
        </span>
        <p className="bk-card-title">Estás en la lista de espera.</p>
        <p className="bk-card-note">
          El grupo de Pablo está completo ahora mismo. En cuanto se abra una plaza te avisamos por
          email, por orden de llegada.
        </p>
      </div>
    );
  } else if (ctx?.active_appointment) {
    const appt = ctx.active_appointment;
    if (appt.status === 'aceptada') {
      // A returning lead's confirmed cita. We don't know its modality, so we use
      // the meet_link as the tell: present → video (join button); absent →
      // presencial, the address is in the email.
      content = (
        <div className="bk-card bk-card--accent">
          <span className="bk-card-eyebrow">
            <span className="bk-dot" aria-hidden="true" /> Cita confirmada
          </span>
          <p className="bk-card-title">
            Cita confirmada para el <strong>{formatFecha(appt.requested_start)}</strong>.
          </p>
          {appt.meet_link ? (
            <MeetButton href={appt.meet_link} />
          ) : (
            <p className="bk-card-note">{ADDRESS_NOTE}</p>
          )}
        </div>
      );
    } else {
      // 'pendiente' (and any defensive fallback): awaiting Pablo's confirmation.
      content = (
        <div className="bk-card">
          <span className="bk-card-eyebrow">
            <span className="bk-dot" aria-hidden="true" /> Pendiente de confirmar
          </span>
          <p className="bk-card-title">
            Tu solicitud para el <strong>{formatFecha(appt.requested_start)}</strong> está
            pendiente de que Pablo la confirme.
          </p>
          <p className="bk-card-note">Te avisaremos por email.</p>
        </div>
      );
    }
  } else if (selected) {
    content = (
      <div className="bk-card bk-card--accent">
        <p className="bk-card-title">
          ¿Reservar el <strong>{formatFecha(selected.start)}</strong>?
        </p>
        <p className="bk-card-note">{CONFIRM_NOTE[modality]}</p>
        <div className="bk-actions">
          <button
            type="button"
            className="bk-btn"
            disabled={posting}
            aria-busy={posting}
            onClick={() => void confirmBooking()}
          >
            {posting ? (
              <>
                <span className="bk-spinner" aria-hidden="true" /> Reservando…
              </>
            ) : (
              <>
                Confirmar reserva <ArrowIcon />
              </>
            )}
          </button>
          <button
            type="button"
            className="bk-btn bk-btn--ghost"
            disabled={posting}
            onClick={() => setSelected(null)}
          >
            Elegir otra hora
          </button>
        </div>
      </div>
    );
  } else if (ctx && ctx.slots.length > 0) {
    content = (
      <>
        {bookError ? (
          <p className="bk-error" role="alert">
            {bookError}
          </p>
        ) : null}
        <div className="bk-scroll">
          {ctx.slots.map((day) => {
            const dayLabel = formatDayLabel(day.slots[0]?.start ?? `${day.date}T12:00:00Z`);
            return (
              <div className="bk-day" key={day.date}>
                <p className="bk-day-label">{dayLabel}</p>
                <div className="bk-times">
                  {day.slots.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      className="bk-chip"
                      aria-label={`Reservar el ${dayLabel} a las ${slot.time}`}
                      onClick={() => chooseSlot(slot)}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  } else {
    // Honest fallback — no configured availability for this modality. Never an
    // empty calendar. (The lead can still toggle back to the other modality.)
    content = (
      <div className="bk-card">
        <p className="bk-card-title">Pablo te escribirá para cuadrar tu llamada.</p>
        <p className="bk-card-note">En breve recibirás un email para agendarla.</p>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {showToggle ? (
        <div className="bk-seg" role="group" aria-label="Tipo de cita">
          {(['video', 'presencial'] as const).map((m) => {
            const active = modality === m;
            return (
              <button
                key={m}
                type="button"
                className={`bk-seg-opt${active ? ' is-active' : ''}`}
                aria-pressed={active}
                disabled={switching || posting}
                onClick={() => switchModality(m)}
              >
                <span className="bk-seg-ic" aria-hidden="true">
                  {m === 'video' ? '📹' : '📍'}
                </span>
                {m === 'video' ? 'Videollamada' : 'Presencial'}
              </button>
            );
          })}
        </div>
      ) : null}
      {content}
    </div>
  );
}

export default BookingSlotPicker;
