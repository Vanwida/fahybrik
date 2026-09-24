// Negocio existe solo con el add-on: sin él, cualquier ruta del área manda a
// Hoy y las acciones de cobro responden 403. Con él, «Marcar cobrado» solo
// alcanza facturas abiertas de SUS atletas. Contra la base real.

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/components/v2/leads/NegocioTabs', () => ({ NegocioTabs: () => null }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const { default: NegocioLayout } = await import('@/app/[locale]/(v2)/negocio/layout');
const { canSeeNegocio } = await import('@/app/[locale]/(v2)/negocio/gate');
const markPaid = await import('@/app/api/coach/cobros/[athlete_id]/marcar-cobrado/route');
const { listOpenInvoices, findOpenInvoice } = await import('@/lib/coach/cobros');

/** redirect() de Next lanza un error con el destino en `digest`. */
async function redirectTarget(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    const digest = (err as { digest?: string }).digest ?? '';
    if (!digest.startsWith('NEXT_REDIRECT')) throw err;
    return digest.split(';')[2] ?? '';
  }
}

describeWithDb('Negocio · portón y cobros (DB real)', () => {
  const sql = getTestSql();
  let withAddon: Fixture;
  let without: Fixture;
  let invoiceSubId: number;
  const as = (fx: Fixture) => vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(fx.coachId) } as never);

  beforeAll(async () => {
    withAddon = await makeCoachAndAthlete(sql);
    without = await makeCoachAndAthlete(sql);
    await sql`insert into coach_entitlements (coach_id, feature, status, source) values (${withAddon.coachId}, 'negocio', 'active', 'founder')`;
    // Suscripción vencida del atleta del coach con Negocio, con una factura abierta y otra pagada.
    const [sub] = await sql<{ id: string }[]>`
      insert into subscriptions (user_id, plan_type, status, stripe_customer_id, agreed_price_cents)
      values (${withAddon.athleteUserId}, 'individual', 'past_due', 'cus_test_gate', 9000) returning id::text`;
    invoiceSubId = Number(sub!.id);
    await sql`insert into athlete_invoices (subscription_id, stripe_invoice_id, amount_cents, status, created_at)
      values (${invoiceSubId}, 'in_test_paid', 9000, 'paid', now() - interval '40 days'),
             (${invoiceSubId}, 'in_test_open', 9000, 'open', now() - interval '3 days')`;
  });

  afterAll(async () => {
    await sql`delete from athlete_invoices where subscription_id = ${invoiceSubId}`;
    await sql`delete from subscriptions where id = ${invoiceSubId}`;
    await sql`delete from coach_entitlements where coach_id in (${withAddon.coachId}, ${without.coachId})`;
    await withAddon.cleanup();
    await without.cleanup();
    await closeTestSql();
  });

  describe('portón', () => {
    test('con el add-on, el área se pinta', async () => {
      as(withAddon);
      expect(await canSeeNegocio(withAddon.coachId)).toBe(true);
      const target = await redirectTarget(
        NegocioLayout({ children: 'hijos', params: Promise.resolve({ locale: 'es' }) }) as Promise<unknown>,
      );
      expect(target).toBeNull();
    });

    test('sin el add-on (o con él inactivo), cualquier ruta de Negocio manda a Hoy', async () => {
      as(without);
      expect(await canSeeNegocio(without.coachId)).toBe(false);
      expect(
        await redirectTarget(NegocioLayout({ children: null, params: Promise.resolve({ locale: 'es' }) }) as Promise<unknown>),
      ).toBe('/es/hoy');
      await sql`insert into coach_entitlements (coach_id, feature, status, source) values (${without.coachId}, 'negocio', 'inactive', 'founder')`;
      expect(await canSeeNegocio(without.coachId)).toBe(false);
    });

    test('sin sesión, también a Hoy (nunca un área a medio pintar)', async () => {
      vi.mocked(getCoachSession).mockResolvedValue(null);
      expect(
        await redirectTarget(NegocioLayout({ children: null, params: Promise.resolve({ locale: 'en' }) }) as Promise<unknown>),
      ).toBe('/en/hoy');
    });
  });

  describe('marcar cobrado', () => {
    const post = (athleteId: number) =>
      markPaid.POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ athlete_id: String(athleteId) }) });

    test('solo ve la factura abierta más reciente de SUS atletas', async () => {
      const mine = await listOpenInvoices(withAddon.coachId);
      expect(mine.get(String(withAddon.athleteId))?.stripe_invoice_id).toBe('in_test_open');
      expect((await listOpenInvoices(without.coachId)).size).toBe(0);
      expect(await findOpenInvoice(without.coachId, withAddon.athleteId)).toEqual({ owned: false, invoice: null });
    });

    test('sin Negocio → 403; atleta ajeno → 404; sin factura abierta → 409', async () => {
      as(without);
      expect((await post(without.athleteId)).status).toBe(403);
      as(withAddon);
      expect((await post(without.athleteId)).status).toBe(404);
      await sql`update athlete_invoices set status = 'paid' where stripe_invoice_id = 'in_test_open'`;
      expect((await post(withAddon.athleteId)).status).toBe(409);
      await sql`update athlete_invoices set status = 'open' where stripe_invoice_id = 'in_test_open'`;
    });
  });
});
