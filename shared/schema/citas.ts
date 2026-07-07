// Zod schemas for the appointment/booking system (funnel #2/#4). Server-side validation
// on every mutation. Public booking is token-gated (opaque lead token, never the id).

import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'formato HH:MM');

/** Public booking request — token identifies the lead, `start` is a chosen slot instant. */
export const bookingInput = z
  .object({
    token: z.string().trim().min(10).max(80),
    start: z.string().datetime({ offset: true }), // ISO instant; server re-checks it's an offered slot
    website: z.string().max(0).optional().or(z.string().optional()), // honeypot
  })
  .strict();
export type BookingInput = z.infer<typeof bookingInput>;

/** Coach: replace the full weekly availability (windows). */
export const availabilityWindowInput = z
  .object({
    weekday: z.number().int().min(0).max(6), // 0=Sun … 6=Sat
    start_time: hhmm,
    end_time: hhmm,
  })
  .refine((w) => w.end_time > w.start_time, {
    message: 'end_time debe ser mayor que start_time',
    path: ['end_time'],
  });
export const availabilitySetInput = z
  .object({ windows: z.array(availabilityWindowInput).max(60) })
  .strict();
export type AvailabilitySetInput = z.infer<typeof availabilitySetInput>;

/** Coach: block a calendar day. */
export const availabilityExceptionInput = z
  .object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    motivo: z.string().trim().max(200).optional(),
  })
  .strict();
export type AvailabilityExceptionInput = z.infer<typeof availabilityExceptionInput>;

/** Coach: act on an appointment. `meet_link` may be pasted on accept (or later). */
export const appointmentActionInput = z
  .object({
    action: z.enum(['aceptar', 'rechazar', 'cancelar', 'completar', 'no_show']),
    meet_link: z.string().trim().url().max(500).optional(),
    coach_note: z.string().trim().max(1000).optional(),
  })
  .strict();
export type AppointmentActionInput = z.infer<typeof appointmentActionInput>;

/** Coach: set/replace the Meet link on an existing appointment (re-sends the email). */
export const appointmentMeetLinkInput = z
  .object({ meet_link: z.string().trim().url().max(500) })
  .strict();
export type AppointmentMeetLinkInput = z.infer<typeof appointmentMeetLinkInput>;
