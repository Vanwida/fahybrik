'use client';

// FAHYBRID — public videollamada booking picker (funnel #2). Reusable across the
// standalone public page (/{locale}/cita/{token}) and the onboarding final screen.
//
// The token IS the credential: on mount it fetches the public booking context and
// then renders exactly one of four honest states — an existing appointment's
// status, a live slot picker, a booked-confirmation, or the "Pablo te escribirá"
// fallback (NEVER an empty calendar). All times are Europe/Madrid, formatted for
// humans with Intl es-ES. Backend contract is fixed; this only reads/writes it.

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
}

type LoadPhase = 'loading' | 'ready' | 'error';

interface BookingSlotPickerProps {
  token: string;
  variant?: 'onboarding' | 'public';
  className?: string;
}

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
/** GET the public booking context. Returns null on any non-OK / network error. */
async function fetchBookingContext(token: string): Promise<BookingContext | null> {
  try {
    const res = await fetch(`/api/citas/context/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as BookingContext;
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function BookingSlotPicker({ token, variant = 'public', className }: BookingSlotPickerProps) {
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [ctx, setCtx] = useState<BookingContext | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [posting, setPosting] = useState(false);
  const [booked, setBooked] = useState<Appointment | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);

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

  // Load on mount. Inline async IIFE with setState AFTER the await (the codebase
  // idiom) so it never triggers a synchronous-setState-in-effect.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchBookingContext(token);
      if (!cancelled) applyContext(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, applyContext]);

  // User-triggered retry from the error state.
  const retry = async () => {
    setPhase('loading');
    applyContext(await fetchBookingContext(token));
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
        body: JSON.stringify({ token, start: selected.start, website: '' }),
      });
      if (res.status === 201) {
        const data = (await res.json()) as { ok: true; appointment: Appointment };
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
      applyContext(await fetchBookingContext(token));
    } catch {
      setBookError('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setPosting(false);
    }
  };

  const rootClass = ['bk', `bk--${variant}`, className].filter(Boolean).join(' ');

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
  } else if (booked) {
    // Just booked in this session — auto-accepted, so it's confirmed on the spot.
    content = (
      <div className="bk-card bk-card--accent" role="status">
        <span className="bk-card-eyebrow">
          <span className="bk-dot" aria-hidden="true" /> Cita confirmada
        </span>
        <p className="bk-card-title">
          Cita confirmada: <strong>{formatFecha(booked.requested_start)}</strong>.
        </p>
        {booked.meet_link ? (
          <div className="bk-actions">
            <a className="bk-btn" href={booked.meet_link} target="_blank" rel="noopener noreferrer">
              Unirme a la videollamada <ArrowIcon />
            </a>
          </div>
        ) : (
          <p className="bk-card-note">Te hemos enviado el email con el enlace de la videollamada.</p>
        )}
      </div>
    );
  } else if (ctx?.active_appointment) {
    const appt = ctx.active_appointment;
    if (appt.status === 'aceptada') {
      content = (
        <div className="bk-card bk-card--accent">
          <span className="bk-card-eyebrow">
            <span className="bk-dot" aria-hidden="true" /> Cita confirmada
          </span>
          <p className="bk-card-title">
            Cita confirmada para el <strong>{formatFecha(appt.requested_start)}</strong>.
          </p>
          {appt.meet_link ? (
            <div className="bk-actions">
              <a
                className="bk-btn"
                href={appt.meet_link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Unirme a la videollamada <ArrowIcon />
              </a>
            </div>
          ) : (
            <p className="bk-card-note">El enlace te llegará antes de la cita.</p>
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
        <p className="bk-card-note">Reservas y listo — te llega el email con el enlace de la videollamada.</p>
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
    // Honest fallback — no configured availability. Never an empty calendar.
    content = (
      <div className="bk-card">
        <p className="bk-card-title">Pablo te escribirá para cuadrar tu llamada.</p>
        <p className="bk-card-note">En breve recibirás un email para agendarla.</p>
      </div>
    );
  }

  return <div className={rootClass}>{content}</div>;
}

export default BookingSlotPicker;
