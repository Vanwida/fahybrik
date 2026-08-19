'use client';

// LeadCitaBlock — the videollamada (funnel #4) control inside the lead detail. Renders
// the lead's current/most-recent appointment by status, driven by the shared status
// machine (appointmentAllowedNext):
//   · null        → calm "sin cita reservada" empty state.
//   · pendiente   → requested slot + Aceptar (accent) / Rechazar.
//   · aceptada    → confirmed slot + Meet-link (link or paste-input) + Cancelar /
//                   Completada / No asistió.
//   · terminal    → status Pill + a muted outcome note.
// All writes flow through useCitaMutation (PATCH action / POST meet-link → refresh).

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/ui/card';
import { Pill, type PillTone } from '@/components/v2/Pill';
import { CitaActionButton, type CitaActionTone } from '@/components/v2/citas/CitaActionButton';
import { useCitaMutation } from '@/components/v2/citas/useCitaMutation';
import { formatCitaDateTime } from '@/components/v2/citas/format';
import {
  APPOINTMENT_STATUS_LABEL,
  appointmentAllowedNext,
  type AppointmentStatus,
  type CoachAppointmentAction,
} from '@fahybrid/shared/domain/citas/status';
import type { AppointmentView } from '@/lib/citas/store';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<AppointmentStatus, PillTone> = {
  pendiente: 'warn',
  aceptada: 'ok',
  rechazada: 'danger',
  cancelada: 'neutral',
  completada: 'info',
  no_show: 'danger',
};

// Target status → the coach action + its button language. Drives the aceptada actions
// off appointmentAllowedNext() and names the pendiente Aceptar/Rechazar buttons.
const ACTION_META: Record<
  Exclude<AppointmentStatus, 'pendiente'>,
  { action: CoachAppointmentAction; label: string; icon: string; tone: CitaActionTone }
> = {
  aceptada: { action: 'aceptar', label: 'Aceptar', icon: 'check_circle', tone: 'accent' },
  rechazada: { action: 'rechazar', label: 'Rechazar', icon: 'cancel', tone: 'danger' },
  cancelada: { action: 'cancelar', label: 'Cancelar', icon: 'event_busy', tone: 'danger' },
  completada: { action: 'completar', label: 'Completada', icon: 'task_alt', tone: 'ok' },
  no_show: { action: 'no_show', label: 'No asistió', icon: 'person_off', tone: 'neutral' },
};

const TERMINAL_NOTE: Record<'rechazada' | 'cancelada' | 'completada' | 'no_show', string> = {
  rechazada: 'Rechazaste esta solicitud de cita.',
  cancelada: 'Esta cita se canceló.',
  completada: 'Videollamada realizada.',
  no_show: 'El lead no se presentó a la videollamada.',
};

const LINK_CLS =
  'v2-focus break-all text-sm font-medium text-[color:var(--v2-fg)] underline-offset-2 transition-colors hover:text-[color:var(--v2-accent)] hover:underline';

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function WhenRow({ iso, durationMinutes }: { iso: string; durationMinutes: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[color:var(--v2-fg)]">
      <MIcon name="event" size={18} className="text-[color:var(--v2-muted)]" />
      <span className="v2-num font-semibold">{formatCitaDateTime(iso)}</span>
      <span className="v2-num text-[color:var(--v2-muted)]">· {durationMinutes} min</span>
    </div>
  );
}

export function LeadCitaBlock({
  appointment,
  onCompleted,
}: {
  appointment: AppointmentView | null;
  /** Fired when the coach marks the cita "Completada" — the lead card opens the parte
   *  form in the same gesture (#14 coupling) so lo hablado no se pierde en caliente. */
  onCompleted?: () => void;
}) {
  const { mutate, busy, activeKey, error } = useCitaMutation();
  const [meetValue, setMeetValue] = useState('');
  const [meetOpen, setMeetOpen] = useState(false);

  const status = appointment?.status ?? null;

  return (
    <Card className="flex flex-col gap-4 p-4 lg:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="v2-micro">Cita · videollamada</h2>
        {status ? (
          <Pill tone={STATUS_TONE[status]} variant="soft">
            {APPOINTMENT_STATUS_LABEL[status]}
          </Pill>
        ) : null}
      </div>

      {/* ── null: never booked ──────────────────────────────────────────────── */}
      {!appointment ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-[color:var(--v2-muted)]">Sin cita reservada.</p>
          <p className="text-xs text-[color:var(--v2-faint)]">
            El lead reserva su videollamada desde el enlace que recibió al terminar el onboarding.
          </p>
        </div>
      ) : null}

      {/* ── pendiente: accept / reject the requested slot ───────────────────── */}
      {appointment && status === 'pendiente' ? (
        <div className="flex flex-col gap-3">
          <WhenRow iso={appointment.requested_start} durationMinutes={appointment.duration_minutes} />
          <p className="text-xs text-[color:var(--v2-muted)]">
            El lead pidió esta hora. Acéptala para confirmarla y avanzar el lead a “Agendado”.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <CitaActionButton
              label={ACTION_META.aceptada.label}
              icon={ACTION_META.aceptada.icon}
              tone={ACTION_META.aceptada.tone}
              spinning={busy && activeKey === 'aceptar'}
              disabled={busy}
              onClick={() => mutate({ kind: 'action', id: appointment.id, action: 'aceptar' }, 'aceptar')}
            />
            <CitaActionButton
              label={ACTION_META.rechazada.label}
              icon={ACTION_META.rechazada.icon}
              tone={ACTION_META.rechazada.tone}
              spinning={busy && activeKey === 'rechazar'}
              disabled={busy}
              onClick={() => mutate({ kind: 'action', id: appointment.id, action: 'rechazar' }, 'rechazar')}
            />
          </div>
        </div>
      ) : null}

      {/* ── aceptada: confirmed — meet link + close-out actions ─────────────── */}
      {appointment && status === 'aceptada' ? (
        <div className="flex flex-col gap-4">
          <WhenRow iso={appointment.requested_start} durationMinutes={appointment.duration_minutes} />

          {/* Meet link — show the link when present, else the paste input. */}
          {appointment.meet_link && !meetOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              <MIcon name="videocam" size={18} className="text-[color:var(--v2-muted)]" />
              <a href={appointment.meet_link} target="_blank" rel="noreferrer" className={LINK_CLS}>
                {appointment.meet_link}
              </a>
              <button
                type="button"
                onClick={() => {
                  setMeetValue(appointment.meet_link ?? '');
                  setMeetOpen(true);
                }}
                className="v2-focus rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] underline-offset-2 hover:text-[color:var(--v2-fg)] hover:underline"
              >
                cambiar
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="meet-link" className="v2-micro">
                Enlace de la videollamada
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="meet-link"
                  type="url"
                  inputMode="url"
                  value={meetValue}
                  onChange={(e) => setMeetValue(e.target.value)}
                  placeholder="https://meet.google.com/…"
                  className={cn(
                    'v2-focus h-9 w-full min-w-0 max-w-md rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 text-sm',
                    'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]',
                  )}
                />
                <CitaActionButton
                  label="Guardar enlace"
                  icon="link"
                  tone="neutral"
                  spinning={busy && activeKey === 'meet'}
                  disabled={busy || !isHttpUrl(meetValue)}
                  onClick={() =>
                    mutate(
                      { kind: 'meet-link', id: appointment.id, meetLink: meetValue.trim() },
                      'meet',
                      () => {
                        setMeetOpen(false);
                        setMeetValue('');
                      },
                    )
                  }
                />
                {appointment.meet_link ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMeetOpen(false);
                      setMeetValue('');
                    }}
                    disabled={busy}
                    className="v2-focus rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)] disabled:opacity-50"
                  >
                    cancelar
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-[color:var(--v2-muted)]">
                Pega el enlace de Meet o Zoom: se lo reenviamos al lead por email.
              </p>
            </div>
          )}

          <div className="h-px w-full bg-[color:var(--v2-border)]" />

          {/* Close-out actions, straight off the shared status machine. */}
          <div className="flex flex-wrap items-center gap-2">
            {appointmentAllowedNext('aceptada').map((next) => {
              const meta = ACTION_META[next as Exclude<AppointmentStatus, 'pendiente'>];
              return (
                <CitaActionButton
                  key={meta.action}
                  label={meta.label}
                  icon={meta.icon}
                  tone={meta.tone}
                  spinning={busy && activeKey === meta.action}
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      { kind: 'action', id: appointment.id, action: meta.action },
                      meta.action,
                      meta.action === 'completar' ? onCompleted : undefined,
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── terminal: outcome note ──────────────────────────────────────────── */}
      {appointment && status && status !== 'pendiente' && status !== 'aceptada' ? (
        <div className="flex flex-col gap-1.5">
          <WhenRow iso={appointment.requested_start} durationMinutes={appointment.duration_minutes} />
          <p className="text-xs text-[color:var(--v2-muted)]">{TERMINAL_NOTE[status]}</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
