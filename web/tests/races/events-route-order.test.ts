// GET /api/events — el bearer de atleta se evalúa ANTES que la sesión coach
// (obra 0 multi-coach). Antes, una cookie de coach en la misma request se
// llevaba el catálogo SIN filtrar aunque el token dijera "atleta".
//
// ROUTE layer (mocks en las fronteras, como free-workout-route): lo que se
// clava aquí es la ORQUESTACIÓN — precedencia de credenciales y qué opts
// recibe listEvents. El SQL del scope vive en events-scope.db.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/coach/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coach/events')>();
  return { ...actual, listEvents: vi.fn() };
});

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { listEvents } = await import('@/lib/coach/events');
const { GET } = await import('@/app/api/events/route');
type EventListItem = Awaited<ReturnType<typeof listEvents>>[number];

const COACH = { coach_id: BigInt(9) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getCoachSession>>
>;
const ATHLETE = { athlete_id: BigInt(7) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

const EVENT = {
  event_id: '1',
  slug: 'x',
  name: 'X',
  type: 'hyrox',
  location: null,
  country: null,
  region: null,
  start_date: null,
  end_date: null,
  division: null,
  division_options: [],
  source_url: null,
  is_visible_to_athletes: true,
  series: null,
  is_tentative: false,
  source: null,
  source_ref: null,
  is_verified: false,
  verified_at: null,
  is_past: false,
  target_count: 0,
} satisfies EventListItem;

function req(withAuth: boolean): Request {
  return new Request('http://localhost/api/events', {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listEvents).mockResolvedValue([{ ...EVENT }]);
  vi.mocked(getCoachSession).mockResolvedValue(null);
  vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
});

describe('GET /api/events — precedencia bearer > cookie', () => {
  it('bearer válido + cookie coach en la MISMA request → vista de ATLETA (visible-only, sin coach_id)', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(ATHLETE);
    vi.mocked(getCoachSession).mockResolvedValue(COACH);

    const res = await GET(req(true));
    const body = (await res.json()) as { role: string; athlete_id: string | null };

    expect(body.role).toBe('athlete');
    expect(body.athlete_id).toBe('7');
    expect(listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'visible', coach_id: undefined }),
    );
    // La sesión coach ni siquiera se consulta cuando el bearer resuelve.
    expect(getCoachSession).not.toHaveBeenCalled();
  });

  it('solo cookie coach → vista de coach, listEvents scoped a SU club (byte a byte)', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(COACH);

    const res = await GET(req(false));
    const body = (await res.json()) as { role: string };

    expect(body.role).toBe('coach');
    expect(listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'all', coach_id: BigInt(9) }),
    );
  });

  it('sin credenciales → vista de atleta anónima (visible-only)', async () => {
    const res = await GET(req(false));
    const body = (await res.json()) as { role: string; athlete_id: string | null };

    expect(body.role).toBe('athlete');
    expect(body.athlete_id).toBeNull();
    expect(listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'visible', coach_id: undefined }),
    );
  });
});
