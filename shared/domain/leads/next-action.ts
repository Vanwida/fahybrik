// Lead "next action" — the ONE imperative Pablo should read per row of the sales
// workbench. Pure, framework-agnostic, deterministic (clock is injectable) so it is
// unit-testable and reusable by a future iOS coach. It folds four independent signals
// — pipeline status, alta sent, the latest 1:1 sales-call outcome, and the most-relevant
// appointment — into a single short verb + a semantic tone.
//
// Ordering rationale (first match wins): a WON/ARCHIVED lead has no chase; an alta in
// flight is terminal-until-claimed; a logged call OUTCOME dictates the move over the raw
// slot (the call already happened); a live slot (to accept / upcoming) beats stale
// history; only then do we fall back to the raw pipeline status. The ladder is total —
// every active, non-terminal lead with an obvious next step yields a non-null action, so
// the workbench never shows a blank where Pablo should be doing something.

import type { LeadStatus } from './status';
import type { AppointmentStatus } from '../citas/status';
import type { SessionOutcome } from '../sessions/outcome';

/** Subset of the web Pill tones the next-action chip uses (accent = do-now, warn = overdue). */
export type NextActionTone = 'accent' | 'info' | 'warn' | 'ok';

export interface NextAction {
  /** Short imperative for the chip, e.g. "Aceptar cita", "Llamada jue 18:00". */
  text: string;
  tone: NextActionTone;
}

export interface NextActionAppointment {
  status: AppointmentStatus;
  /** ISO instant of the slot — future/past is decided against `now`. */
  requested_start: string;
  /** Caller-formatted Madrid short "jue 18:00". Kept here (not computed) so this helper
   *  stays pure and its tests are timezone/locale independent. */
  when_short: string;
}

export interface NextActionInput {
  status: LeadStatus;
  is_partial: boolean;
  /** ISO when the alta invite was sent, null if not sent. */
  alta_sent_at: string | null;
  /** Outcome of the lead's most-recent (non-deleted) 1:1 sales call, null if none/unset. */
  latest_outcome: SessionOutcome | null;
  /** Whether ANY non-deleted report exists — distinct from `latest_outcome`, which can be
   *  null even when a report was logged. Drives the "Registrar la llamada" gate. */
  has_report: boolean;
  /** Most-relevant appointment (soonest future active, else latest), or null. */
  appointment: NextActionAppointment | null;
  /** Injectable clock for deterministic tests; defaults to now. */
  now?: Date;
}

export function deriveNextAction(input: NextActionInput): NextAction | null {
  const { status, is_partial, alta_sent_at, latest_outcome, has_report, appointment } = input;
  const now = input.now ?? new Date();

  // ── Terminal / in-flight ──────────────────────────────────────────────────────
  if (status === 'descartado') return null; // archived — nothing to chase
  if (status === 'convertido') return { text: 'Convertido', tone: 'ok' };
  if (alta_sent_at) return { text: 'Alta enviada · esperando', tone: 'info' };

  // ── The call outcome outranks the raw slot: the call happened, act on its result ─
  if (latest_outcome === 'quiere_empezar') return { text: 'Dar de alta', tone: 'accent' };

  const apptIsFuture =
    appointment != null && Date.parse(appointment.requested_start) >= now.getTime();

  // ── Live appointment ──────────────────────────────────────────────────────────
  if (appointment?.status === 'pendiente') return { text: 'Aceptar cita', tone: 'accent' };
  if (appointment?.status === 'aceptada' && apptIsFuture) {
    return { text: `Llamada ${appointment.when_short}`, tone: 'info' };
  }
  // The confirmed call time has passed (or it was marked done) and nothing is logged yet.
  const callDoneNoReport =
    !has_report &&
    ((appointment?.status === 'aceptada' && !apptIsFuture) || appointment?.status === 'completada');
  if (callDoneNoReport) return { text: 'Registrar la llamada', tone: 'warn' };
  // Booked but they never showed and it isn't written up — get them re-booked.
  if (appointment?.status === 'no_show' && !has_report) {
    return { text: 'Reagendar llamada', tone: 'info' };
  }

  // ── A logged outcome that implies a concrete follow-up (or explicitly none) ──────
  if (latest_outcome === 'seguimiento' || latest_outcome === 'pensandoselo') {
    return { text: 'Hacer seguimiento', tone: 'info' };
  }
  if (latest_outcome === 'no_asistio') return { text: 'Reagendar llamada', tone: 'info' };
  if (latest_outcome === 'no_interesado') return null; // nothing to chase; coach may descartar

  // ── Raw pipeline-status fallback ──────────────────────────────────────────────
  if (status === 'contactado') return { text: 'Agendar llamada', tone: 'info' };
  if (status === 'agendado') return { text: 'Reagendar llamada', tone: 'info' }; // booked, active slot gone
  if (is_partial) return { text: 'Recontactar (sin terminar)', tone: 'warn' };
  if (status === 'nuevo') return { text: 'Contactar', tone: 'accent' };

  return null;
}
