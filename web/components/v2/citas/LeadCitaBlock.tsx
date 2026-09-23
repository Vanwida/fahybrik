'use client';

// La llamada con un lead, dentro de su panel. Según el estado de la cita:
//   · sin cita   → una línea: reserva desde el enlace que recibió.
//   · pendiente  → la hora pedida + Aceptar / Rechazar.
//   · aceptada   → la hora, el enlace de la videollamada (o pegarlo) y cerrar:
//                  Hecha · No vino · Cancelar.
//   · terminada  → cómo acabó.
// Todas las escrituras pasan por useCitaMutation (PATCH / POST → refresco).

import { useState } from 'react';
import { CalendarClock, Check, Link2, UserX, Video, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  APPOINTMENT_STATUS_LABEL,
  appointmentAllowedNext,
  type AppointmentStatus,
  type CoachAppointmentAction,
} from '@fahybrid/shared/domain/citas/status';
import type { AppointmentView } from '@/lib/citas/store';
import { Button, Input, StatusBadge, buttonVariants, type StatusTone } from '@/components/v2/ui';
import { useCitaMutation } from './useCitaMutation';
import { formatCitaDateTime } from './format';
import { useCoachTimeZone } from '@/lib/coach/coach-timezone-context';

const STATUS_TONE: Record<AppointmentStatus, StatusTone> = {
  pendiente: 'warn',
  aceptada: 'ok',
  rechazada: 'neutral',
  cancelada: 'neutral',
  completada: 'ok',
  no_show: 'warn',
};

const CLOSE_ACTION: Partial<
  Record<AppointmentStatus, { action: CoachAppointmentAction; label: string; icon: LucideIcon; variant: 'secondary' | 'ghost' }>
> = {
  completada: { action: 'completar', label: 'Hecha', icon: Check, variant: 'secondary' },
  no_show: { action: 'no_show', label: 'No vino', icon: UserX, variant: 'secondary' },
  cancelada: { action: 'cancelar', label: 'Cancelar', icon: X, variant: 'ghost' },
};

const OUTCOME: Record<'rechazada' | 'cancelada' | 'completada' | 'no_show', string> = {
  rechazada: 'Rechazaste esta hora.',
  cancelada: 'La llamada se canceló.',
  completada: 'Llamada hecha.',
  no_show: 'No se presentó.',
};

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function LeadCitaBlock({
  appointment,
  onCompleted,
}: {
  appointment: AppointmentView | null;
  /** Al marcarla hecha se abre el parte de la llamada en el mismo gesto (#14). */
  onCompleted?: () => void;
}) {
  const { mutate, busy, activeKey, error } = useCitaMutation();
  const tz = useCoachTimeZone();
  const [meet, setMeet] = useState('');
  const [editingMeet, setEditingMeet] = useState(false);

  if (!appointment) {
    return <p className="t-body-sm text-v2-muted">Sin llamada reservada. La reserva desde el enlace que le llegó al terminar el formulario.</p>;
  }
  const status = appointment.status;
  const when = (
    <span className="inline-flex items-center gap-1.5 t-body text-v2-fg t-tnum">
      <CalendarClock aria-hidden className="size-4 text-v2-muted" strokeWidth={1.75} />
      {formatCitaDateTime(appointment.requested_start, tz)} · {appointment.duration_minutes} min
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {when}
        <StatusBadge tone={STATUS_TONE[status]} label={APPOINTMENT_STATUS_LABEL[status]} size="sm" />
      </div>

      {status === 'pendiente' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            loading={busy && activeKey === 'aceptar'}
            disabled={busy}
            onClick={() => mutate({ kind: 'action', id: appointment.id, action: 'aceptar' }, 'aceptar')}
          >
            Aceptar la hora
          </Button>
          <Button
            variant="ghost"
            loading={busy && activeKey === 'rechazar'}
            disabled={busy}
            onClick={() => mutate({ kind: 'action', id: appointment.id, action: 'rechazar' }, 'rechazar')}
          >
            Rechazar
          </Button>
        </div>
      ) : null}

      {status === 'aceptada' ? (
        <>
          {appointment.meet_link && !editingMeet ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={appointment.meet_link}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: 'secondary' })}
              >
                <Video aria-hidden strokeWidth={1.75} />
                Abrir la videollamada
              </a>
              <Button
                variant="ghost"
                onClick={() => {
                  setMeet(appointment.meet_link ?? '');
                  setEditingMeet(true);
                }}
              >
                Cambiar enlace
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="url"
                inputMode="url"
                icon={Link2}
                value={meet}
                aria-label="Enlace de la videollamada"
                placeholder="Pega el enlace de Meet o Zoom"
                onChange={(e) => setMeet(e.target.value)}
                className="min-w-0 flex-1"
              />
              <Button
                loading={busy && activeKey === 'meet'}
                disabled={busy || !isHttpUrl(meet)}
                onClick={() =>
                  mutate({ kind: 'meet-link', id: appointment.id, meetLink: meet.trim() }, 'meet', () => {
                    setEditingMeet(false);
                    setMeet('');
                  })
                }
              >
                Guardar y enviárselo
              </Button>
              {appointment.meet_link ? (
                <Button variant="ghost" onClick={() => setEditingMeet(false)}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {appointmentAllowedNext('aceptada').map((next) => {
              const a = CLOSE_ACTION[next];
              if (!a) return null;
              return (
                <Button
                  key={a.action}
                  size="sm"
                  variant={a.variant}
                  icon={a.icon}
                  loading={busy && activeKey === a.action}
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      { kind: 'action', id: appointment.id, action: a.action },
                      a.action,
                      a.action === 'completar' ? onCompleted : undefined,
                    )
                  }
                >
                  {a.label}
                </Button>
              );
            })}
          </div>
        </>
      ) : null}

      {status !== 'pendiente' && status !== 'aceptada' ? (
        <p className="t-body-sm text-v2-muted">{OUTCOME[status]}</p>
      ) : null}

      {error ? (
        <p role="alert" className="t-body-sm text-v2-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
