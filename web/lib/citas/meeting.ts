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

import { getGoogleRefreshToken } from './google-tokens';
import { createCalendarEventWithMeet } from './google';

// Fallback co-attendee (coach inbox) if LEADS_NOTIFY_EMAIL isn't set.
const COACH_NOTIFY_FALLBACK = 'hello@fahybrid.com';

export interface MeetingRequest {
  appointmentId: string;
  start: Date;
  durationMinutes: number;
  leadEmail: string;
  leadName: string | null;
}

export interface MeetingResult {
  meet_link: string | null;
  /** Google Calendar event id when auto-created — for the cancel-hook delete. */
  event_id?: string | null;
}

/** Best-effort meeting link for an appointment. Never throws — a null link is valid. */
export async function createMeeting(req: MeetingRequest): Promise<MeetingResult> {
  // Connected only if a coach completed the one-shot Google connect. Any DB hiccup here
  // must not break the accept flow → treat as "not connected".
  let refreshToken: string | null = null;
  try {
    refreshToken = await getGoogleRefreshToken();
  } catch {
    return { meet_link: null };
  }
  if (!refreshToken) return { meet_link: null };

  const start = req.start;
  const end = new Date(start.getTime() + req.durationMinutes * 60 * 1000);
  const coachNotify = process.env.LEADS_NOTIFY_EMAIL ?? COACH_NOTIFY_FALLBACK;

  try {
    const { event_id, meet_link } = await createCalendarEventWithMeet({
      summary: `Videollamada FAHYBRID · ${req.leadName ?? req.leadEmail}`,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      attendeeEmails: [req.leadEmail, coachNotify],
    });
    // event_id is persisted by the accept route (setAppointmentMeetLink) so the cancel
    // branch can delete the calendar event — see app/api/coach/appointments/[id]/route.ts.
    return { meet_link, event_id };
  } catch {
    // Google failed → fall back to the manual-link path with a null link.
    return { meet_link: null };
  }
}
