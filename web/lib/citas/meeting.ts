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
import { createCalendarEventWithMeet } from './google';

// Fallback co-attendee (coach inbox) if LEADS_NOTIFY_EMAIL isn't set.
const COACH_NOTIFY_FALLBACK = 'hello@fahybrid.com';
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
}): Promise<MeetingResult> {
  // Connected only if a coach completed the one-shot Google connect. Any DB hiccup here
  // must not break the accept/book flow → treat as "not connected".
  let refreshToken: string | null = null;
  try {
    refreshToken = await getGoogleRefreshToken();
  } catch {
    return { meet_link: null };
  }
  if (!refreshToken) return { meet_link: null };

  const end = new Date(args.start.getTime() + args.durationMinutes * 60 * 1000);
  const coachNotify = process.env.LEADS_NOTIFY_EMAIL ?? COACH_NOTIFY_FALLBACK;

  try {
    const { event_id, meet_link } = await createCalendarEventWithMeet({
      summary: args.summary,
      startIso: args.start.toISOString(),
      endIso: end.toISOString(),
      attendeeEmails: [args.attendee.email, coachNotify],
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
}

/** Best-effort meeting link for a LEAD intro appointment. Never throws. */
export async function createMeeting(req: MeetingRequest): Promise<MeetingResult> {
  return createAttendeeMeeting({
    attendee: { email: req.leadEmail, name: req.leadName },
    start: req.start,
    durationMinutes: req.durationMinutes,
    summary: `Videollamada FAHYBRID · ${req.leadName ?? req.leadEmail}`,
  });
}

// ── Athlete 1:1 review (#21) ─────────────────────────────────────────────────────
export interface ReviewMeetingRequest {
  appointmentId: string;
  start: Date;
  durationMinutes?: number;
  athleteEmail: string;
  athleteName: string | null;
}

/** Best-effort Meet link for an ATHLETE 1:1 review appointment (#21). Never throws. */
export async function createReviewMeeting(req: ReviewMeetingRequest): Promise<MeetingResult> {
  return createAttendeeMeeting({
    attendee: { email: req.athleteEmail, name: req.athleteName },
    start: req.start,
    durationMinutes: req.durationMinutes ?? DEFAULT_DURATION_MINUTES,
    summary: `Revisión FAHYBRID · ${req.athleteName ?? req.athleteEmail}`,
  });
}
