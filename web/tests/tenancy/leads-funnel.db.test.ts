/**
 * El embudo público de leads (hallazgo P1 nº6). Sin autenticar, cualquiera que
 * escribiera el email de otra persona sobrescribía sus respuestas —fuera del club
 * que fuera— y se llevaba su token de reserva. Y como el email era único global,
 * una persona solo podía ser lead de un club. Handlers reales contra la BD de
 * pruebas (migración 0253).
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

import { POST as draft } from '@/app/api/leads/route';
import { POST as complete } from '@/app/api/leads/complete/route';
import { LEAD_CAPTURE_COOKIE, captureKeyFromCookieHeader } from '@/lib/leads/capture-key';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('tenancy — embudo público de leads', () => {
  const sql = getTestSql();
  let A: Fixture;
  let B: Fixture;
  const prevFunnel = process.env.FUNNEL_COACH_ID;
  let n = 0;

  const email = `victima-${Date.now()}@test.local`;
  const req = (body: unknown, cookie?: string) => {
    n += 1;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${n}.${Math.floor(Math.random() * 250)}`,
    };
    if (cookie) headers.cookie = cookie;
    return new Request('http://localhost/api/leads', { method: 'POST', headers, body: JSON.stringify(body) });
  };
  const cookieOf = (res: Response) => {
    const key = captureKeyFromCookieHeader(res.headers.get('set-cookie')?.split(';')[0] ?? null);
    return key ? `${LEAD_CAPTURE_COOKIE}=${key}` : undefined;
  };
  const submit = (telefono: string, extra: Record<string, unknown> = {}) => ({
    email,
    telefono,
    consent_rgpd: true,
    ...extra,
  });

  beforeAll(async () => {
    A = await makeCoachAndAthlete(sql);
    B = await makeCoachAndAthlete(sql);
  });
  afterEach(() => {
    if (prevFunnel === undefined) delete process.env.FUNNEL_COACH_ID;
    else process.env.FUNNEL_COACH_ID = prevFunnel;
  });
  afterAll(async () => {
    await sql`delete from leads where email = ${email}`;
    await A.cleanup();
    await B.cleanup();
    await closeTestSql();
  });

  test('la víctima rellena el embudo; otro navegador con su email no pisa nada ni se lleva el token', async () => {
    process.env.FUNNEL_COACH_ID = String(A.coachId);

    // La víctima: borrador → completar, con la clave que le deja el borrador.
    const d = await draft(req({ email, nombre: 'Víctima' }));
    expect(d.status).toBe(201);
    const cookie = cookieOf(d);
    expect(cookie).toBeDefined();
    const c = await complete(req(submit('600111222', { nombre: 'Víctima' }), cookie));
    const cBody = (await c.json()) as { token?: string };
    expect(typeof cBody.token).toBe('string');

    // El atacante: mismo email, sin clave.
    const d2 = await draft(req({ email, nombre: 'Atacante' }));
    expect(await d2.json()).toEqual({ ok: true });
    const c2 = await complete(req(submit('699999999', { nombre: 'Atacante' })));
    expect(c2.status).toBe(200);
    const c2Body = (await c2.json()) as Record<string, unknown>;
    expect(c2Body.token).toBeUndefined();
    expect(c2Body.lead_id).toBeUndefined();
    expect(c2.headers.get('set-cookie')).toBeNull();

    const rows = await sql<{ nombre: string; telefono: string; token: string }[]>`
      select nombre, telefono, token from leads where email = ${email} and coach_id = ${A.coachId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.nombre).toBe('Víctima');
    expect(rows[0]!.telefono).toBe('600111222');
    expect(rows[0]!.token).toBe(cBody.token);

    // La víctima, desde su navegador, sí puede volver a completar.
    const c3 = await complete(req(submit('600333444', { nombre: 'Víctima' }), cookie));
    expect(((await c3.json()) as { token?: string }).token).toBe(cBody.token);
  });

  test('el mismo email puede ser lead de dos clubs: el embudo de B no se funde en la fila de A', async () => {
    process.env.FUNNEL_COACH_ID = String(B.coachId);
    const c = await complete(req(submit('611000000', { nombre: 'Otra vida' })));
    expect(c.status).toBe(201);
    const rows = await sql<{ coach_id: string; telefono: string }[]>`
      select coach_id::text, telefono from leads where email = ${email} order by coach_id`;
    expect(rows.map((r) => Number(r.coach_id)).sort()).toEqual([A.coachId, B.coachId].sort());
    const a = rows.find((r) => Number(r.coach_id) === A.coachId)!;
    expect(a.telefono).toBe('600333444');
  });
});
