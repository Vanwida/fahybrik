// Appointment status machine — shared (web coach dashboard + future iOS). Mirrors the
// pg `appointment_status` enum (migration 0093). Pure; no framework.

export type AppointmentStatus =
  | 'pendiente'
  | 'aceptada'
  | 'rechazada'
  | 'cancelada'
  | 'completada'
  | 'no_show';

/** A lead can have at most one appointment in an ACTIVE state at a time. */
export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = ['pendiente', 'aceptada'];
export const TERMINAL_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'rechazada',
  'cancelada',
  'completada',
  'no_show',
];

export function isActiveAppointment(s: AppointmentStatus): boolean {
  return ACTIVE_APPOINTMENT_STATUSES.includes(s);
}

// Coach-driven transitions. pendiente → accept/reject/cancel; aceptada → cancel / mark
// done / no-show. Everything terminal is final.
const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pendiente: ['aceptada', 'rechazada', 'cancelada'],
  aceptada: ['cancelada', 'completada', 'no_show'],
  rechazada: [],
  cancelada: [],
  completada: [],
  no_show: [],
};

export function canTransitionAppointment(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function appointmentAllowedNext(from: AppointmentStatus): AppointmentStatus[] {
  return APPOINTMENT_TRANSITIONS[from] ?? [];
}

/** Human labels (Spanish) for chips/copy. */
export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  pendiente: 'Pendiente',
  aceptada: 'Confirmada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  completada: 'Completada',
  no_show: 'No asistió',
};

/** Coach action verbs (dashboard buttons) → target status. */
export type CoachAppointmentAction = 'aceptar' | 'rechazar' | 'cancelar' | 'completar' | 'no_show';

export const APPOINTMENT_ACTION_TO_STATUS: Record<CoachAppointmentAction, AppointmentStatus> = {
  aceptar: 'aceptada',
  rechazar: 'rechazada',
  cancelar: 'cancelada',
  completar: 'completada',
  no_show: 'no_show',
};
