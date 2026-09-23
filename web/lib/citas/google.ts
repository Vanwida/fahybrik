// Plain-fetch Google client for the citas videollamada adapter — OAuth 2.0 consent,
// token exchange/refresh, and Calendar-event-with-Meet creation. No `googleapis`
// dependency (we only need three HTTP calls), so this stays a thin, auditable module.
//
// Flow (per COACH — migration 0254):
//   1. /api/citas/google/connect → buildConsentUrl(state bound to the coach) → consent.
//   2. Google → /api/citas/google/callback?code=…&state=… → the state's coach must be
//      the signed-in coach → exchangeCode → store THAT coach's refresh_token.
//   3. On each accepted cita, createMeeting (lib/citas/meeting.ts) takes the connection
//      of the cita's coach, mints an access token and creates the event on THAT coach's
//      calendar. No connection → no event.
//
// CSRF: the OAuth `state` is a stateless HMAC-signed token (coach_id+nonce+timestamp,
// keyed by AUTH_SECRET). The callback re-computes the MAC, rejects tampered or expired
// states (RFC 6749 §10.12) and returns the coach it was issued to.
//
// Never logs tokens. Env is read at call time (never at import) so tests and the
// gated/unconnected state don't need Google creds present.

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { getGoogleConnection, type GoogleConnection } from '@/lib/citas/google-tokens';

// ── Endpoints & scope ──────────────────────────────────────────────────────────
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// Least-privilege: manage events on calendars the user already has, nothing else.
export const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// ── State signing (CSRF) ─────────────────────────────────────────────────────────
// 15 min: the consent round-trip is seconds; cap replay risk. 16 bytes → 128 bits nonce.
const STATE_TTL_SECONDS = 15 * 60;
const STATE_NONCE_BYTES = 16;
// state = `${coachId}.${nonce}.${issuedAtSec}.${base64url(HMAC-SHA256(coachId.nonce.issuedAtSec))}`
const STATE_PARTS = 4;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function redirectUri(): string {
  // MUST match the URI registered in the Google OAuth client, and IS the callback
  // route path. Prod: https://fahybrid.com/api/citas/google/callback
  return `${AUTH_CONFIG.appUrl()}/api/citas/google/callback`;
}

function signStatePayload(payload: string): string {
  // AUTH_SECRET is the app's signing key; reusing it avoids a new secret to manage.
  return createHmac('sha256', AUTH_CONFIG.authSecret()).update(payload).digest('base64url');
}

/** Build a fresh HMAC-signed OAuth `state`, bound to the coach who starts the connect. */
export function createSignedState(coach_id: bigint | number, now: Date = new Date()): string {
  const nonce = randomBytes(STATE_NONCE_BYTES).toString('hex');
  const issuedAt = Math.floor(now.getTime() / 1000).toString();
  const payload = `${String(coach_id)}.${nonce}.${issuedAt}`;
  return `${payload}.${signStatePayload(payload)}`;
}

/**
 * Verify an OAuth `state`: constant-time MAC check + TTL. Returns the coach it was
 * issued to, or null = reject the callback. The caller must ALSO check that coach is
 * the one signed in: otherwise a coach could start the flow and send the consent link
 * to someone else, whose Google account would end up wired to that coach's club.
 */
export function verifySignedState(state: string, now: Date = new Date()): bigint | null {
  const parts = state.split('.');
  if (parts.length !== STATE_PARTS) return null;
  const [coach, nonce, issuedAt, sig] = parts;
  if (!coach || !nonce || !issuedAt || !sig || !/^\d{1,18}$/.test(coach)) return null;

  const expected = signStatePayload(`${coach}.${nonce}.${issuedAt}`);
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  // Length guard first: timingSafeEqual throws on length mismatch.
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;

  const issued = Number(issuedAt);
  if (!Number.isFinite(issued)) return null;
  const ageSec = Math.floor(now.getTime() / 1000) - issued;
  // Reject clock-skewed-future and expired states.
  if (ageSec < 0 || ageSec > STATE_TTL_SECONDS) return null;
  const id = BigInt(coach);
  return id > BigInt(0) ? id : null;
}

// ── Consent + token exchange ─────────────────────────────────────────────────────
/** The Google consent URL to redirect the coach to (one-shot connect). */
export function buildConsentUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: CALENDAR_EVENTS_SCOPE,
    access_type: 'offline', // ask for a refresh_token…
    prompt: 'consent', // …and force it to be returned even on re-consent.
    include_granted_scopes: 'true',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** Exchange the authorization `code` for tokens. Requires a refresh_token in the response. */
export async function exchangeCode(code: string): Promise<{ refresh_token: string; access_token: string }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status}`);
  const data = (await res.json()) as { refresh_token?: string; access_token?: string };
  if (!data.refresh_token || !data.access_token) {
    // Google only returns a refresh_token when access_type=offline + prompt=consent
    // AND the account hasn't already granted it. Surface the cause, never the token.
    throw new Error('google token exchange returned no refresh_token');
  }
  return { refresh_token: data.refresh_token, access_token: data.access_token };
}

/** Mint a short-lived access token from a coach's refresh_token. */
export async function getAccessToken(conn: GoogleConnection): Promise<string> {
  const refresh_token = conn.refresh_token;
  if (!refresh_token) throw new Error('google not connected: no refresh_token stored');
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token,
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) throw new Error(`google access-token mint failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('google access-token mint returned no access_token');
  return data.access_token;
}

// ── Calendar event + Meet ────────────────────────────────────────────────────────
export interface CreateCalendarEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  attendeeEmails: string[];
}

/**
 * Create a Calendar event on the COACH's calendar with a Google Meet conference, then
 * return its id + Meet link. conferenceDataVersion=1 is required for createRequest to
 * be honored. We do NOT set sendUpdates — the branded Resend confirmation email is the
 * single notification the lead gets; the attendees are added silently.
 */
export async function createCalendarEventWithMeet(
  conn: GoogleConnection,
  input: CreateCalendarEventInput,
): Promise<{ event_id: string; meet_link: string | null }> {
  const accessToken = await getAccessToken(conn);
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(conn.calendar_id)}/events?conferenceDataVersion=1`;
  const body = {
    summary: input.summary,
    ...(input.description ? { description: input.description } : {}),
    start: { dateTime: input.startIso },
    end: { dateTime: input.endIso },
    attendees: input.attendeeEmails.map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: randomUUID(), // unique per event → Google mints one Meet room.
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`google calendar event insert failed: ${res.status}`);
  const data = (await res.json()) as {
    id: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  };
  return { event_id: data.id, meet_link: extractMeetLink(data) };
}

/**
 * #40: create a Calendar event WITHOUT a Meet conference but WITH a physical `location`
 * (presencial cita). Same calendar as the Meet path; no conferenceData / conferenceDataVersion.
 * Returns the event id (for the cancel-hook delete) and meet_link:null — presencial never
 * has a Meet link. Mirrors createCalendarEventWithMeet: no sendUpdates (the Resend
 * confirmation email is the single notification), attendees added silently.
 */
export async function createCalendarEventInPerson(
  conn: GoogleConnection,
  input: CreateCalendarEventInput & { location: string },
): Promise<{ event_id: string; meet_link: null }> {
  const accessToken = await getAccessToken(conn);
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(conn.calendar_id)}/events`;
  const body = {
    summary: input.summary,
    ...(input.description ? { description: input.description } : {}),
    location: input.location,
    start: { dateTime: input.startIso },
    end: { dateTime: input.endIso },
    attendees: input.attendeeEmails.map((email) => ({ email })),
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`google calendar event insert failed: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return { event_id: data.id, meet_link: null };
}

function extractMeetLink(data: {
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
}): string | null {
  if (data.hangoutLink) return data.hangoutLink;
  const video = data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video');
  return video?.uri ?? null;
}

/**
 * Best-effort delete of a Calendar event (cancel-hook) from the calendar of the coach
 * whose cita it is. Swallows everything — removing the calendar entry must NEVER block
 * a cita cancellation — and treats 404/410 (already gone) as success. No connection →
 * nothing to delete there.
 */
export async function deleteCalendarEvent(
  coach_id: bigint | number | null | undefined,
  event_id: string,
): Promise<void> {
  try {
    const conn = await getGoogleConnection(coach_id);
    if (!conn) return;
    const accessToken = await getAccessToken(conn);
    await fetch(
      `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(conn.calendar_id)}/events/${encodeURIComponent(event_id)}`,
      { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` } },
    );
    // Any status (incl. 404/410) is acceptable: the goal is "not on the calendar".
  } catch {
    // Swallow — best-effort cleanup only.
  }
}
