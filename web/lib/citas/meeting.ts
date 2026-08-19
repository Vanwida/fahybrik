// Videollamada link adapter. ONE interface, two implementations:
//   • v1 / not-connected: returns null — no automatic link. The confirmation email says
//     the link will arrive before the call, and the coach can paste a Meet link manually
//     on the accepted appointment (setAppointmentMeetLink). The whole circuit works today.
//   • Google (connected): once the coach completes the one-shot connect
//     (/api/citas/google/connect → a refresh_token is stored), create a Calendar event
//     with conferenceData (Meet) + attendees and return the hangoutLink.
//
// The switch is DATA, not env: a stored refresh_token (getGoogleRefreshToken) means
// "connected". No token → null (unchanged v1 behavior). NEVER throws — a null link is
// valid, and any Google failure falls back to the manual-paste path.
//
// #21: generalized to an ATTENDEE {email,name} so the SAME engine mints a Meet for a
// lead intro call (createMeeting) OR an athlete 1:1 review (createReviewMeeting), reusing
// createCalendarEventWithMeet with zero duplication. The cancel-hook (deleteCalendarEvent)
// is already generic (keys on google_event_id), so it covers both.

import { getGoogleRefreshToken } from './google-tokens';
import { createCalendarEventWithMeet, createCalendarEventInPerson } from './google';
import type { CitaModality } from '@fahybrid/shared/schema';

const DEFAULT_DURATION_MINUTES = 30;

export interface MeetingResult {
  meet_link: string | null;
  /** Google Calendar event id when auto-created — for the cancel-hook delete. */
  event_id?: string | null;
}

/** The person the videollamada is with (lead or athlete) — the calendar attendee. */
export interface MeetingAttendee {
  email: string;
  name: string | null;
}

// ── Generic core (shared by lead intro + athlete review) ─────────────────────────
async function createAttendeeMeeting(args: {
  attendee: MeetingAttendee;
  start: Date;
  durationMinutes: number;
  /** Event title, e.g. "Videollamada FAHYBRID · Ana" or "Revisión FAHYBRID · Ana". */
  summary: string;
  /** #40: video → Calendar event with a Meet room; presencial → event with a location, no Meet. */
  modality: CitaModality;
  /** #40: presencial address string (box name + street). Ignored for video. */
  location?: string | null;
  /** Club that owns this cita — attendees include its notify inbox when set. */
  coach_id?: bigint | number | null;
}): Promise<MeetingResult> {
  // Connected only if a coach completed the one-shot Google connect. Any DB hiccup here
  // must not break the accept/book flow → treat as "not connected".
  let refreshToken: string | null = null;
  try {
    refreshToken = await getGoogleRefreshToken();
  } catch {
    return { meet_link: null };
  }
  // Not connected: no calendar event either way. Presencial still shows its address in the
  // email (the caller passes the location there regardless of Google).
  if (!refreshToken) return { meet_link: null };

  const end = new Date(args.start.getTime() + args.durationMinutes * 60 * 1000);
  let clubInbox: string | null = null;
  try {
    const { resolveClubNotifyEmail } = await import('@/lib/coach/club-notify');
    clubInbox = await resolveClubNotifyEmail(args.coach_id ?? null);
  } catch {
    clubInbox = null;
  }
  const attendeeEmails = clubInbox
    ? [args.attendee.email, clubInbox]
    : [args.attendee.email];

  try {
    // Presencial: a Calendar event WITH the location and NO Meet — but only if we actually
    // have an address to put on it. No address → no event, null link (the manual-paste path).
    if (args.modality === 'presencial') {
      if (!args.location) return { meet_link: null };
      const { event_id } = await createCalendarEventInPerson({
        summary: args.summary,
        startIso: args.start.toISOString(),
        endIso: end.toISOString(),
        attendeeEmails,
        location: args.location,
      });
      // meet_link stays null (presencial); event_id persisted by the caller for the cancel-hook.
      return { meet_link: null, event_id };
    }

    const { event_id, meet_link } = await createCalendarEventWithMeet({
      summary: args.summary,
      startIso: args.start.toISOString(),
      endIso: end.toISOString(),
      attendeeEmails,
    });
    // event_id is persisted by the caller (setAppointmentMeetLink) so the cancel branch
    // can delete the calendar event — see app/api/coach/appointments/[id]/route.ts.
    return { meet_link, event_id };
  } catch {
    // Google failed → fall back to the manual-link path with a null link.
    return { meet_link: null };
  }
}

// ── Lead intro call (funnel #2/#4) ───────────────────────────────────────────────
export interface MeetingRequest {
  appointmentId: string;
  start: Date;
  durationMinutes: number;
  leadEmail: string;
  leadName: string | null;
  /** #40: video (Meet) o presencial (evento con location, sin Meet). */
  modality: CitaModality;
  /** #40: presencial address string (box name + street). Ignored for video. */
  location?: string | null;
  /** Club of this lead — calendar attendees include its notify inbox when set. */
  coach_id?: bigint | number | null;
}

/** Best-effort meeting link for a LEAD intro appointment. Never throws. Presencial never
 *  returns a meet_link (event_id may still be set for the cancel-hook). */
export async function createMeeting(req: MeetingRequest): Promise<MeetingResult> {
  const who = req.leadName ?? req.leadEmail;
  const summary =
    req.modality === 'presencial'
      ? `Sesión presencial FAHYBRID · ${who}`
      : `Videollamada FAHYBRID · ${who}`;
  return createAttendeeMeeting({
    attendee: { email: req.leadEmail, name: req.leadName },
    start: req.start,
    durationMinutes: req.durationMinutes,
    summary,
    modality: req.modality,
    location: req.location,
    coach_id: req.coach_id,
  });
}

// ── Athlete 1:1 review (#21) ─────────────────────────────────────────────────────
export interface ReviewMeetingRequest {
  appointmentId: string;
  start: Date;
  durationMinutes?: number;
  athleteEmail: string;
  athleteName: string | null;
  coach_id?: bigint | number | null;
}

/** Best-effort Meet link for an ATHLETE 1:1 review appointment (#21). Never throws.
 *  Reviews are video-only (a Meet room), so modality is fixed to 'video'. */
export async function createReviewMeeting(req: ReviewMeetingRequest): Promise<MeetingResult> {
  return createAttendeeMeeting({
    attendee: { email: req.athleteEmail, name: req.athleteName },
    start: req.start,
    durationMinutes: req.durationMinutes ?? DEFAULT_DURATION_MINUTES,
    summary: `Revisión FAHYBRID · ${req.athleteName ?? req.athleteEmail}`,
    modality: 'video',
    coach_id: req.coach_id,
  });
}
