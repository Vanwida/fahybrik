/**
 * El portón de Negocio en la API (hallazgo P1 nº7). Las páginas de Negocio ya
 * mandaban a Hoy a quien no tiene el add-on, pero sus rutas de API respondían a
 * cualquier coach autenticado. Handlers reales contra la BD de pruebas; solo se
 * finge la sesión (la frontera de auth).
 */
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const leads = await import('@/app/api/coach/leads/route');
const lead = await import('@/app/api/coach/leads/[id]/route');
const alta = await import('@/app/api/coach/leads/[id]/alta/route');
const release = await import('@/app/api/coach/leads/[id]/release-waitlist/route');
const pending = await import('@/app/api/coach/citas/pending/route');
const appt = await import('@/app/api/coach/appointments/[id]/route');
const meet = await import('@/app/api/coach/appointments/[id]/meet-link/route');
const cobro = await import('@/app/api/coach/cobros/[athlete_id]/marcar-cobrado/route');
const reports = await import('@/app/api/coach/session-reports/route');
const summary = await import('@/app/api/coach/session-reports/[id]/send-summary/route');

type CoachSession = NonNullable<Awaited<ReturnType<typeof getCoachSession>>>;
const as = (fx: Fixture) =>
  vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(fx.coachId), user_id: BigInt(fx.coachUserId) } as unknown as CoachSession);
const post = (body: unknown = {}) =>
  new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const patch = (body: unknown = {}) =>
  new Request('http://localhost/x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const id = (v: string) => ({ params: Promise.resolve({ id: v }) });

describeWithDb('tenancy — Negocio exige el add-on también en la API', () => {
  const sql = getTestSql();
  let sin: Fixture;
  let con: Fixture;

  beforeAll(async () => {
    sin = await makeCoachAndAthlete(sql);
    con = await makeCoachAndAthlete(sql);
    await sql`insert into coach_entitlements (coach_id, feature, status, source) values (${con.coachId}, 'negocio', 'active', 'founder')`;
  });
  afterAll(async () => {
    await sql`delete from session_reports where coach_id in (${sin.coachId}, ${con.coachId})`;
    await sql`delete from coach_entitlements where coach_id in (${sin.coachId}, ${con.coachId})`;
    await sin.cleanup();
    await con.cleanup();
    await closeTestSql();
  });

  test('sin Negocio: cada ruta de Negocio responde 403 negocio_required', async () => {
    as(sin);
    const calls: Array<Promise<Response>> = [
      leads.GET(),
      lead.GET(new Request('http://localhost/x'), id('1')),
      lead.PATCH(patch({ status: 'descartado' }), id('1')),
      alta.POST(post(), id('1')),
      release.POST(post(), id('1')),
      pending.GET(),
      appt.PATCH(patch({ action: 'cancelar' }), id('1')),
      meet.POST(post({ meet_link: 'https://meet.google.com/abc-defg-hij' }), id('1')),
      cobro.POST(post(), { params: Promise.resolve({ athlete_id: String(sin.athleteId) }) }),
      reports.POST(post({ lead_id: 1, notes: 'x' })),
      summary.POST(post(), id('1')),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('negocio_required');
    }
  });

  test('sin Negocio: un parte sobre SU atleta sí se guarda (no es Negocio)', async () => {
    as(sin);
    const res = await reports.POST(post({ athlete_id: sin.athleteId, notes: '1:1' }));
    expect(res.status).toBe(201);
  });

  test('con Negocio: la lista de leads responde', async () => {
    as(con);
    const res = await leads.GET();
    expect(res.status).toBe(200);
  });
});
