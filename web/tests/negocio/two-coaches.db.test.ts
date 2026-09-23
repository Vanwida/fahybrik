/**
 * Negocio con dueño — TWO coaches on one real database, and not a single row crosses.
 *
 * Every Negocio loader and route the panel uses is called as coach A and as coach B over
 * the same seeded world (leads, citas, lista de espera, embudo, agenda, cobros, mensajes,
 * búsqueda) and must return ONLY its own coach's rows. The rule under test is
 * `leadOwnedBy` (lib/leads/owner.ts) plus the per-coach agenda of migration 0220.
 *
 * Route handlers are the real ones against the real DB; only the coach session (the auth
 * boundary) is mocked, as in tests/periodizacion/levels-route-scope.db.test.ts.
 */

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { listLeadsForCoach, countNewLeads, getLeadDetail } = await import('@/lib/dashboard/coach/leads');
const { countCallsToday, listUpcomingCalls } = await import('@/lib/citas/calls');
const { computeSlots, bookAppointment } = await import('@/lib/citas/store');
const { getAvailability, setAvailability, addException, removeException, getStudioLocation } = await import(
  '@/lib/citas/availability'
);
const { listWaitlist, countWaitlist } = await import('@/lib/leads/waitlist');
const { loadFunnelSnapshot, loadCallOutcomes, loadWeeklySeries, loadByObjetivo } = await import(
  '@/lib/dashboard/coach/metrics'
);
const { buildBusinessMetrics } = await import('@/lib/dashboard/coach/business-metrics');
const { countThreadsAwaitingReply, loadShellBadges } = await import('@/lib/dashboard/coach/shell-badges');
const { searchCoach } = await import('@/lib/coach/search');
const { loadHoy } = await import('@/lib/dashboard/hoy/load-hoy');
const leadsRoute = await import('@/app/api/coach/leads/route');
const callsRoute = await import('@/app/api/coach/citas/pending/route');
const availabilityRoute = await import('@/app/api/coach/availability/route');
const exceptionsRoute = await import('@/app/api/coach/availability/exceptions/route');
const exceptionRoute = await import('@/app/api/coach/availability/exceptions/[id]/route');
const searchRoute = await import('@/app/api/coach/search/route');

type CoachSession = NonNullable<Awaited<ReturnType<typeof getCoachSession>>>;
const DAY_MS = 86_400_000;

describeWithDb('Negocio: two coaches, zero cross-tenant rows (real DB)', () => {
  const sql = getTestSql();
  let A: Fixture;
  let B: Fixture;
  const leadIds: number[] = [];
  const tag = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const savedFunnel = process.env.FUNNEL_COACH_ID;

  const lead: Record<string, number> = {};
  let tokenBookA = '';
  let tokenBookB = '';

  function as(fx: Fixture) {
    vi.mocked(getCoachSession).mockResolvedValue({
      coach_id: BigInt(fx.coachId),
      user_id: BigInt(fx.coachUserId),
      club_name: `Club ${fx.coachId}`,
      full_name: 'Coach',
      email: 'c@test.local',
    } as unknown as CoachSession);
  }

  async function seedLead(
    key: string,
    coachId: number | null,
    opts: { status?: string; waitlisted?: boolean; objetivo?: string } = {},
  ) {
    const r = await sql<{ id: string; token: string }[]>`
      insert into leads (email, nombre, status, source, coach_id, objetivo, submitted_at, waitlisted_at)
      values (${`neg-${key}-${tag}@test.local`}, ${`Lead ${key}`}, ${opts.status ?? 'nuevo'}::lead_status,
              'onboarding_web', ${coachId}, ${opts.objetivo ?? 'primer_hyrox'}, now(),
              ${opts.waitlisted ? new Date(Date.now() - DAY_MS) : null})
      returning id::text as id, token`;
    lead[key] = Number(r[0]!.id);
    leadIds.push(Number(r[0]!.id));
    return r[0]!.token;
  }

  async function seedCallToday(leadId: number) {
    // A few minutes ahead: still "today" unless the suite runs in the last minutes before
    // Madrid midnight (the assertion below guards for that).
    await sql`
      insert into appointments (lead_id, requested_start, status)
      values (${leadId}, now() + interval '3 minutes', 'aceptada')`;
  }

  async function seedAwaitingThread(fx: Fixture, lastFrom: 'athlete' | 'coach') {
    const t = await sql<{ id: string }[]>`
      insert into chat_threads (coach_id, athlete_id, last_message_at)
      values (${fx.coachId}, ${fx.athleteId}, now()) returning id::text as id`;
    await sql`
      insert into chat_messages (thread_id, sender_user_id, sender_role, body, created_at)
      values (${Number(t[0]!.id)}, ${fx.athleteUserId}, 'athlete', 'hola', now() - interval '2 minutes')`;
    if (lastFrom === 'coach') {
      await sql`
        insert into chat_messages (thread_id, sender_user_id, sender_role, body, created_at)
        values (${Number(t[0]!.id)}, ${fx.coachUserId}, 'coach', 'dime', now() - interval '1 minute')`;
    }
  }

  beforeAll(async () => {
    delete process.env.FUNNEL_COACH_ID;
    A = await makeCoachAndAthlete(sql);
    B = await makeCoachAndAthlete(sql);

    await seedLead('a_new', A.coachId, { waitlisted: true, objetivo: 'podio' });
    await seedLead('a_call', A.coachId, { status: 'agendado' });
    tokenBookA = await seedLead('a_book', A.coachId);
    await seedLead('b_new', B.coachId, { waitlisted: true });
    await seedLead('b_call', B.coachId, { status: 'agendado' });
    tokenBookB = await seedLead('b_book', B.coachId);
    await seedLead('unassigned', null, { waitlisted: true });
    await seedCallToday(lead.a_call!);
    await seedCallToday(lead.b_call!);

    await sql`update coaches set studio_name = ${`Box A ${tag}`}, location = 'Calle A' where id = ${A.coachId}`;
    await sql`update coaches set studio_name = ${`Box B ${tag}`}, location = 'Calle B' where id = ${B.coachId}`;

    await seedAwaitingThread(A, 'athlete'); // A has one thread waiting for them
    await seedAwaitingThread(B, 'coach'); // B already answered

    await sql`insert into subscriptions (user_id, plan_type, status, source) values (${A.athleteUserId}, 'individual', 'active', 'stripe')`;

    // Search world: same-looking names on both sides.
    await sql`update athletes set full_name = ${`Zoë Álvarez ${tag}`} where id = ${A.athleteId}`;
    await sql`update athletes set full_name = ${`Zoe Alvarez ${tag}`} where id = ${B.athleteId}`;
    for (const fx of [A, B]) {
      await sql`insert into program_month_templates (coach_id, name) values (${fx.coachId}, ${`Fuerza base ${tag}`})`;
      const lv = await sql<{ id: string }[]>`
        insert into athlete_levels (coach_id, name, label) values (${fx.coachId}, ${`N${tag}`}, 'Base')
        returning id::text as id`;
      await sql`
        insert into program_sequences (coach_id, level_id, days_per_week)
        values (${fx.coachId}, ${Number(lv[0]!.id)}, 4)`;
      await sql`
        insert into templates (coach_id, name, format)
        values (${fx.coachId}, ${`Entreno umbral ${tag}`}, 'for_time')`;
    }
  });

  afterAll(async () => {
    if (savedFunnel === undefined) delete process.env.FUNNEL_COACH_ID;
    else process.env.FUNNEL_COACH_ID = savedFunnel;
    const coachIds = [A.coachId, B.coachId];
    if (leadIds.length) {
      await sql`delete from appointments where lead_id in ${sql(leadIds)}`;
      await sql`delete from lead_status_events where lead_id in ${sql(leadIds)}`;
      await sql`delete from leads where id in ${sql(leadIds)}`;
    }
    await sql`delete from chat_messages where thread_id in (select id from chat_threads where coach_id in ${sql(coachIds)})`;
    await sql`delete from chat_threads where coach_id in ${sql(coachIds)}`;
    await sql`delete from subscriptions where user_id in (${A.athleteUserId}, ${B.athleteUserId})`;
    await sql`delete from program_sequences where coach_id in ${sql(coachIds)}`;
    await sql`delete from program_month_templates where coach_id in ${sql(coachIds)}`;
    await sql`delete from athlete_levels where coach_id in ${sql(coachIds)}`;
    await A.cleanup();
    await B.cleanup();
    await closeTestSql();
  });

  const idsOf = (rows: { id?: string; lead_id?: string }[]) => rows.map((r) => Number(r.id ?? r.lead_id));

  // ── Leads ────────────────────────────────────────────────────────────────────────
  test('listLeadsForCoach / countNewLeads / getLeadDetail: own only; unassigned to nobody', async () => {
    const a = await listLeadsForCoach(A.coachId);
    const b = await listLeadsForCoach(B.coachId);
    expect(new Set(idsOf(a.leads))).toEqual(new Set([lead.a_new, lead.a_call, lead.a_book]));
    expect(new Set(idsOf(b.leads))).toEqual(new Set([lead.b_new, lead.b_call, lead.b_book]));
    expect(a.en_espera).toBe(1);
    expect(await countNewLeads(A.coachId)).toBe(2); // a_new + a_book
    expect(await countNewLeads(B.coachId)).toBe(2);
    expect(await getLeadDetail(BigInt(lead.b_new!), A.coachId)).toBeNull();
    expect(await getLeadDetail(BigInt(lead.unassigned!), A.coachId)).toBeNull();
  });

  test('unassigned leads reach ONLY the funnel operator', async () => {
    process.env.FUNNEL_COACH_ID = String(A.coachId);
    try {
      expect(idsOf((await listLeadsForCoach(A.coachId)).leads)).toContain(lead.unassigned);
      expect(idsOf((await listLeadsForCoach(B.coachId)).leads)).not.toContain(lead.unassigned);
      expect(idsOf(await listWaitlist(A.coachId))).toContain(lead.unassigned);
      expect(idsOf(await listWaitlist(B.coachId))).not.toContain(lead.unassigned);
    } finally {
      delete process.env.FUNNEL_COACH_ID;
    }
  });

  test('Hoy «leads nuevos» uses the same owner rule: an unassigned lead is not everybody\'s', async () => {
    await sql`insert into coach_entitlements (coach_id, feature, source)
              values (${A.coachId}, 'negocio', 'test'), (${B.coachId}, 'negocio', 'test')`;
    try {
      const leadsOf = async (coach: number) =>
        (await loadHoy({ coach_id: coach, client: sql })).systemic.find((g) => g.kind === 'leads_new')?.item_ids ?? [];
      // Sin operador del embudo: solo los suyos (antes, el sin dueño salía a los dos).
      expect((await leadsOf(A.coachId)).map(Number)).not.toContain(lead.unassigned);
      expect((await leadsOf(B.coachId)).map(Number)).not.toContain(lead.unassigned);
      expect(await leadsOf(B.coachId)).toHaveLength(await countNewLeads(B.coachId));
      process.env.FUNNEL_COACH_ID = String(A.coachId);
      try {
        expect((await leadsOf(A.coachId)).map(Number)).toContain(lead.unassigned);
        expect((await leadsOf(B.coachId)).map(Number)).not.toContain(lead.unassigned);
      } finally {
        delete process.env.FUNNEL_COACH_ID;
      }
    } finally {
      await sql`delete from coach_entitlements where coach_id = any(${[A.coachId, B.coachId]}::bigint[]) and source = 'test'`;
    }
  });

  test('waitlist: per coach, positions within the coach\'s own queue', async () => {
    const a = await listWaitlist(A.coachId);
    expect(idsOf(a)).toEqual([lead.a_new]);
    expect(a[0]!.position).toBe(1);
    expect(idsOf(await listWaitlist(B.coachId))).toEqual([lead.b_new]);
    expect(await countWaitlist(A.coachId)).toBe(1);
    expect(await countWaitlist(B.coachId)).toBe(1);
  });

  // ── Calls ────────────────────────────────────────────────────────────────────────
  test('countCallsToday / listUpcomingCalls: own calls only', async () => {
    const aCalls = await listUpcomingCalls(A.coachId);
    expect(aCalls.map((c) => Number(c.lead_id))).toEqual([lead.a_call]);
    expect((await listUpcomingCalls(B.coachId)).map((c) => Number(c.lead_id))).toEqual([lead.b_call]);
    const nearMidnight = new Date(Date.now() + 3 * 60_000).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) !==
      new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
    if (!nearMidnight) {
      expect(await countCallsToday(A.coachId)).toBe(1);
      expect(await countCallsToday(B.coachId)).toBe(1);
    }
  });

  // ── Agenda (0220) ──────────────────────────────────────────────────────────────────
  test('availability: each coach reads and replaces ONLY their own windows', async () => {
    const monday = { weekday: 1, start_time: '09:00', end_time: '11:00', modality: 'video' as const };
    await setAvailability(A.coachId, [monday]);
    await setAvailability(B.coachId, [{ ...monday, weekday: 3 }]);
    await setAvailability(B.coachId, [{ ...monday, weekday: 4 }]); // B replaces — A untouched
    expect((await getAvailability(A.coachId)).windows.map((w) => w.weekday)).toEqual([1]);
    expect((await getAvailability(B.coachId)).windows.map((w) => w.weekday)).toEqual([4]);
  });

  test('blocked days: same date for both; another coach cannot unblock yours', async () => {
    const fecha = new Date(Date.now() + 5 * DAY_MS).toISOString().slice(0, 10);
    const exA = await addException(A.coachId, fecha, 'A cierra');
    const exB = await addException(B.coachId, fecha, 'B cierra');
    expect(exA.id).not.toBe(exB.id);
    expect(await removeException(B.coachId, BigInt(exA.id))).toBe(false);
    expect((await getAvailability(A.coachId)).exceptions.map((e) => e.id)).toContain(exA.id);
    expect(await removeException(A.coachId, BigInt(exA.id))).toBe(true);
    await removeException(B.coachId, BigInt(exB.id));
  });

  test('slots: one coach\'s booking never blocks the other\'s hour', async () => {
    const window = { weekday: 0, start_time: '08:00', end_time: '20:00', modality: 'video' as const };
    const all = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ ...window, weekday }));
    await setAvailability(A.coachId, all);
    await setAvailability(B.coachId, all);
    const now = new Date();
    const firstA = (await computeSlots(BigInt(A.coachId), 'video', now)).flatMap((d) => d.slots)[0]!.start;

    const booked = await bookAppointment({ token: tokenBookA, startIso: firstA, modality: 'video', now });
    expect(booked.coach_id).toBe(BigInt(A.coachId));
    const aAfter = (await computeSlots(BigInt(A.coachId), 'video', now)).flatMap((d) => d.slots.map((s) => s.start));
    const bAfter = (await computeSlots(BigInt(B.coachId), 'video', now)).flatMap((d) => d.slots.map((s) => s.start));
    expect(aAfter).not.toContain(firstA);
    expect(bAfter).toContain(firstA);
    // …and B's lead can take that very hour on B's calendar.
    const bBooked = await bookAppointment({ token: tokenBookB, startIso: firstA, modality: 'video', now });
    expect(bBooked.coach_id).toBe(BigInt(B.coachId));
    expect(await computeSlots(null, 'video', now)).toEqual([]);
  });

  test('presencial address is the calendar coach\'s', async () => {
    expect((await getStudioLocation(A.coachId))?.name).toBe(`Box A ${tag}`);
    expect((await getStudioLocation(B.coachId))?.name).toBe(`Box B ${tag}`);
    expect(await getStudioLocation(null)).toBeNull();
  });

  // ── Embudo + cobros ──────────────────────────────────────────────────────────────
  test('funnel metrics: each coach counts only their leads; visits only for the landing operator', async () => {
    const snapA = await loadFunnelSnapshot(A.coachId, 'todo');
    const snapB = await loadFunnelSnapshot(B.coachId, 'todo');
    expect(snapA.stages.iniciado).toBe(3);
    expect(snapB.stages.iniciado).toBe(3);
    expect(snapA.visitas).toBeNull(); // no funnel operator declared
    const objA = await loadByObjetivo(A.coachId, 'todo');
    expect(objA.find((r) => r.objetivo === 'podio')?.onboardings).toBe(1);
    expect((await loadByObjetivo(B.coachId, 'todo')).find((r) => r.objetivo === 'podio')).toBeUndefined();
    const out = await loadCallOutcomes(B.coachId, 'todo');
    expect(Object.values(out.counts).reduce((s, n) => s + n, 0)).toBe(0);
    const weekA = await loadWeeklySeries(A.coachId);
    expect(weekA[weekA.length - 1]!.onboardings).toBe(3);
  });

  test('business metrics scoped to a coach\'s athletes', async () => {
    expect((await buildBusinessMetrics({ coach_id: A.coachId })).active_count).toBe(1);
    expect((await buildBusinessMetrics({ coach_id: B.coachId })).active_count).toBe(0);
  });

  // ── Shell badges ─────────────────────────────────────────────────────────────────
  test('awaiting-reply threads and Negocio badge are per coach', async () => {
    expect(await countThreadsAwaitingReply(A.coachId)).toBe(1);
    expect(await countThreadsAwaitingReply(B.coachId)).toBe(0);
    const badges = await loadShellBadges(B.coachId);
    expect(badges.awaiting_reply).toBe(0);
    expect(badges.negocio).toBeGreaterThanOrEqual(2); // b_new + b_book (+ today's call)
  });

  // ── Search ───────────────────────────────────────────────────────────────────────
  test('search: four typed groups, own rows only, accent/case-insensitive, word order free', async () => {
    const a = await searchCoach({ coach_id: A.coachId, q: `ALVAREZ zoe ${tag}` });
    expect(idsOf(a.athletes)).toEqual([A.athleteId]);
    const b = await searchCoach({ coach_id: B.coachId, q: `álvarez ${tag}` });
    expect(idsOf(b.athletes)).toEqual([B.athleteId]);

    const prog = await searchCoach({ coach_id: A.coachId, q: `fuerza ${tag}` });
    expect(prog.programs).toHaveLength(1);
    expect(prog.programs[0]!.name).toBe(`Fuerza base ${tag}`);
    const own = await sql<{ id: string }[]>`
      select id::text as id from program_month_templates where coach_id = ${A.coachId}`;
    expect(prog.programs[0]!.id).toBe(own[0]!.id);

    const groups = await searchCoach({ coach_id: A.coachId, q: `n${tag} 4 dias` });
    expect(groups.groups).toHaveLength(1);
    const lib = await searchCoach({ coach_id: B.coachId, q: `umbral ${tag}` });
    expect(lib.library).toHaveLength(1);
    expect(lib.library[0]!.kind).toBe('entreno');
    const ownT = await sql<{ id: string }[]>`select id::text as id from templates where coach_id = ${B.coachId}`;
    expect(lib.library[0]!.id).toBe(ownT[0]!.id);
  });

  // ── Routes (real handlers, mocked session) ───────────────────────────────────────
  test('GET /api/coach/leads and /api/coach/citas/pending answer with the session coach\'s rows', async () => {
    as(B);
    const leads = await (await leadsRoute.GET()).json();
    const ids = leads.leads.map((l: { id: string }) => Number(l.id));
    expect(new Set(ids)).toEqual(new Set([lead.b_new, lead.b_call, lead.b_book]));
    const calls = await (await callsRoute.GET()).json();
    const callLeads = calls.calls.map((c: { lead_id: string }) => Number(c.lead_id));
    expect(callLeads).not.toContain(lead.a_call);
  });

  test('availability routes: PUT as B never touches A; DELETE of A\'s day as B is 404', async () => {
    const put = (body: unknown) =>
      new Request('http://localhost/api/coach/availability', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    as(A);
    await availabilityRoute.PUT(put({ windows: [{ weekday: 2, start_time: '10:00', end_time: '12:00', modality: 'video' }] }));
    as(B);
    const resB = await availabilityRoute.PUT(put({ windows: [] }));
    expect(resB.status).toBe(200);
    expect((await getAvailability(A.coachId)).windows.map((w) => w.weekday)).toEqual([2]);

    as(A);
    const fecha = new Date(Date.now() + 9 * DAY_MS).toISOString().slice(0, 10);
    const created = await exceptionsRoute.POST(
      new Request('http://localhost/api/coach/availability/exceptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fecha, motivo: 'vacaciones' }),
      }),
    );
    expect(created.status).toBe(201);
    const body = await created.json();
    const exId = body.exception.id as string;
    as(B);
    const del = await exceptionRoute.DELETE(new Request('http://localhost/x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: exId }),
    });
    expect(del.status).toBe(404);
    as(A);
    const delOwn = await exceptionRoute.DELETE(new Request('http://localhost/x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: exId }),
    });
    expect(delOwn.status).toBe(200);
  });

  test('GET /api/coach/search returns typed groups for the session coach only', async () => {
    as(A);
    const res = await searchRoute.GET(new Request(`http://localhost/api/coach/search?q=${encodeURIComponent(`zoe ${tag}`)}`));
    const json = await res.json();
    const data = json;
    expect(Object.keys(data).sort()).toEqual(['athletes', 'groups', 'library', 'programs']);
    expect(data.athletes.map((a: { id: string }) => Number(a.id))).toEqual([A.athleteId]);
    const empty = await (await searchRoute.GET(new Request('http://localhost/api/coach/search?q='))).json();
    expect(empty.athletes).toEqual([]);
  });
});
