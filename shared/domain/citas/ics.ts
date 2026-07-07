// Minimal iCalendar (.ics) builder — PURE, zero dependencies. Enough to attach a
// valid VEVENT to the "cita confirmada" email so the lead can add it to any calendar.
// RFC 5545: CRLF line endings, UTC timestamps (…Z), TEXT escaping of , ; \ and newlines.

export interface IcsEvent {
  /** Globally-unique id (e.g. `appt-<id>@fahybrid.com`). */
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description?: string;
  /** Meet link or a place; shown as LOCATION. */
  location?: string;
  organizerEmail?: string;
  attendeeEmail?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** UTC timestamp in iCal basic format: YYYYMMDDTHHMMSSZ. */
function icsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildIcs(ev: IcsEvent): string {
  const end = new Date(ev.start.getTime() + ev.durationMinutes * 60_000);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FAHYBRID//Citas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${icsUtc(new Date())}`,
    `DTSTART:${icsUtc(ev.start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${escapeText(ev.summary)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.organizerEmail) lines.push(`ORGANIZER:mailto:${ev.organizerEmail}`);
  if (ev.attendeeEmail) {
    lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${ev.attendeeEmail}`);
  }
  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}
