// Unit tests for the Google-backed citas videollamada adapter (lib/citas/meeting.ts +
// lib/citas/google.ts). NO network, NO DB:
//   • global fetch is mocked (routes by URL: token endpoint vs Calendar API).
//   • lib/citas/google-tokens is mocked so we control "connected vs not" without a DB.
//
// Coverage:
//   (a) no connection for the cita's coach (or no coach) → null, never calls Google;
//   (b) token present → the Calendar request is built correctly (conferenceDataVersion=1,
//       hangoutsMeet createRequest, attendees incl. lead + coach, 30-min window, summary)
//       and the Meet link is parsed from a mocked response;
//   (c) the state HMAC round-trips (valid verifies; tampered rejects).

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Google/auth envs are read at call time (never at import) — set before any test body.
process.env.AUTH_SECRET = 'test-auth-secret-value';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.APP_URL = 'https://fahybrid.com';

// Control "connected vs not" without touching the DB.
vi.mock('@/lib/citas/google-tokens', () => ({
  getGoogleConnection: vi.fn(),
  saveGoogleConnection: vi.fn(),
}));

const resolveClubNotifyEmail = vi.fn(async () => null as string | null);
vi.mock('@/lib/coach/club-notify', () => ({ resolveClubNotifyEmail }));

// La piel del club de ESTA cita: el título del evento lleva SU nombre.
const resolveClubEmailSkin = vi.fn(async () => ({ wordmark: 'Club Norte' }));
vi.mock('@/lib/coach/club-skin', () => ({ resolveClubEmailSkin }));

import { createMeeting } from '@/lib/citas/meeting';
import { getGoogleConnection } from '@/lib/citas/google-tokens';

const CONN = { refresh_token: 'stored-refresh-token', calendar_id: 'primary' };
import { createSignedState, verifySignedState } from '@/lib/citas/google';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_PREFIX = 'https://www.googleapis.com/calendar/v3/calendars/';

const MEET_LINK = 'https://meet.google.com/abc-defg-hij';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface CapturedCall {
  url: string;
  init: RequestInit | undefined;
}

/** Mock fetch that answers the token mint + the Calendar insert; records the Calendar call. */
function installFetchMock(): { calendarCall: () => CapturedCall | null; tokenCalls: () => number } {
  let calendar: CapturedCall | null = null;
  let tokens = 0;
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === TOKEN_URL) {
      tokens += 1;
      return jsonResponse({ access_token: 'ya29.test-access-token', expires_in: 3599 });
    }
    if (url.startsWith(CALENDAR_PREFIX)) {
      calendar = { url, init };
      return jsonResponse({
        id: 'evt_test_123',
        hangoutLink: MEET_LINK,
        conferenceData: {
          entryPoints: [{ entryPointType: 'video', uri: MEET_LINK }],
        },
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
  vi.stubGlobal('fetch', mock);
  return { calendarCall: () => calendar, tokenCalls: () => tokens };
}

beforeEach(() => {
  vi.mocked(getGoogleConnection).mockReset();
  resolveClubNotifyEmail.mockReset();
  resolveClubNotifyEmail.mockResolvedValue(null);
  vi.unstubAllGlobals();
  delete process.env.LEADS_NOTIFY_EMAIL;
});

describe('createMeeting — not connected', () => {
  it('returns a null link and never calls Google when the coach has no connection', async () => {
    vi.mocked(getGoogleConnection).mockResolvedValue(null);
    const { calendarCall, tokenCalls } = installFetchMock();

    const result = await createMeeting({
      appointmentId: '1',
      start: new Date('2026-07-15T09:00:00Z'),
      durationMinutes: 30,
      leadEmail: 'lead@example.com',
      leadName: 'Ana Ruiz',
      modality: 'video',
    });

    expect(result).toEqual({ meet_link: null });
    expect(calendarCall()).toBeNull();
    expect(tokenCalls()).toBe(0);
  });

  it('swallows a DB error and falls back to a null link (accept flow must not break)', async () => {
    vi.mocked(getGoogleConnection).mockRejectedValue(new Error('db down'));
    installFetchMock();

    const result = await createMeeting({
      appointmentId: '1',
      start: new Date('2026-07-15T09:00:00Z'),
      durationMinutes: 30,
      leadEmail: 'lead@example.com',
      leadName: null,
      modality: 'video',
    });

    expect(result.meet_link).toBeNull();
  });
});

describe('createMeeting — connected', () => {
  it('builds the Calendar+Meet request correctly and parses the meet_link', async () => {
    vi.mocked(getGoogleConnection).mockResolvedValue(CONN);
    const { calendarCall } = installFetchMock();

    const result = await createMeeting({
      appointmentId: '42',
      start: new Date('2026-07-15T09:00:00Z'),
      durationMinutes: 30,
      leadEmail: 'lead@example.com',
      leadName: 'Ana Ruiz',
      modality: 'video',
      coach_id: BigInt(7),
    });

    // La conexión es la del coach de ESTA cita (0254), nunca una global.
    expect(getGoogleConnection).toHaveBeenCalledWith(BigInt(7));
    // Meet link parsed + event id returned for the cancel-hook.
    expect(result.meet_link).toBe(MEET_LINK);
    expect(result.event_id).toBe('evt_test_123');

    const call = calendarCall();
    expect(call).not.toBeNull();

    // URL: correct calendar + the version flag that makes createRequest work.
    expect(call!.url).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
    );
    expect(call!.init?.method).toBe('POST');
    // Bearer auth from the minted access token.
    const headers = call!.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer ya29.test-access-token');

    const body = JSON.parse(call!.init?.body as string);
    // 30-min window off the requested start.
    expect(body.start.dateTime).toBe('2026-07-15T09:00:00.000Z');
    expect(body.end.dateTime).toBe('2026-07-15T09:30:00.000Z');
    // Summary: el club de la cita (su piel) + el nombre del lead. Nunca otra marca.
    expect(resolveClubEmailSkin).toHaveBeenCalledWith(BigInt(7));
    expect(body.summary).toBe('Videollamada Club Norte · Ana Ruiz');
    // Meet conference requested via hangoutsMeet with a unique requestId.
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
    expect(typeof body.conferenceData.createRequest.requestId).toBe('string');
    expect(body.conferenceData.createRequest.requestId.length).toBeGreaterThan(0);
    // Sin correo del club: solo el lead. hello@ no entra nunca.
    const emails = (body.attendees as Array<{ email: string }>).map((a) => a.email);
    expect(emails).toEqual(['lead@example.com']);
    expect(emails).not.toContain('hello@fahybrid.com');
  });

  it('incluye el correo del club cuando existe, nunca hello@', async () => {
    vi.mocked(getGoogleConnection).mockResolvedValue(CONN);
    resolveClubNotifyEmail.mockResolvedValue('avisos@northbox.test');
    const { calendarCall } = installFetchMock();

    await createMeeting({
      appointmentId: '42',
      start: new Date('2026-07-15T09:00:00Z'),
      durationMinutes: 30,
      leadEmail: 'lead@example.com',
      leadName: 'Ana Ruiz',
      modality: 'video',
      coach_id: BigInt(7),
    });

    const body = JSON.parse(calendarCall()!.init?.body as string);
    const emails = (body.attendees as Array<{ email: string }>).map((a) => a.email);
    expect(emails).toEqual(['lead@example.com', 'avisos@northbox.test']);
    expect(emails).not.toContain('hello@fahybrid.com');
    expect(resolveClubNotifyEmail).toHaveBeenCalledWith(BigInt(7));
  });

  it('falls back to a null link when the Calendar insert fails (never throws)', async () => {
    vi.mocked(getGoogleConnection).mockResolvedValue(CONN);
    // Token mints OK, but the Calendar insert 500s.
    const mock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === TOKEN_URL) return jsonResponse({ access_token: 'ya29.x' });
      return jsonResponse({ error: 'boom' }, 500);
    });
    vi.stubGlobal('fetch', mock);

    const result = await createMeeting({
      appointmentId: '42',
      start: new Date('2026-07-15T09:00:00Z'),
      durationMinutes: 30,
      leadEmail: 'lead@example.com',
      leadName: 'Ana Ruiz',
      modality: 'video',
      coach_id: BigInt(7),
    });

    expect(result).toEqual({ meet_link: null });
  });
});

describe('OAuth state HMAC (CSRF), bound to the coach', () => {
  it('a freshly-signed state verifies and names its coach', () => {
    const state = createSignedState(BigInt(42));
    expect(verifySignedState(state)).toBe(BigInt(42));
  });

  it('a tampered state is rejected — also one whose coach was swapped', () => {
    const state = createSignedState(BigInt(42));
    const parts = state.split('.');
    // Flip the signature segment.
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}deadbeef`;
    expect(verifySignedState(tampered)).toBeNull();

    // Another coach's id with the old signature → MAC mismatch.
    const swapped = `43.${parts[1]}.${parts[2]}.${parts[3]}`;
    expect(verifySignedState(swapped)).toBeNull();
  });

  it('an expired state is rejected', () => {
    // Issued 16 min ago (> 15-min TTL).
    const past = new Date(Date.now() - 16 * 60 * 1000);
    const state = createSignedState(BigInt(42), past);
    expect(verifySignedState(state)).toBeNull();
  });

  it('a malformed state (wrong shape, or the old unbound shape) is rejected', () => {
    expect(verifySignedState('not-a-valid-state')).toBeNull();
    expect(verifySignedState('')).toBeNull();
    expect(verifySignedState('nonce.123.sig')).toBeNull();
  });
});
